import { MikroORM, RequestContext } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import pg from 'pg';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { configureApp } from '../src/configure-app.js';
import { OrdersService } from '../src/orders/orders.service.js';
import {
  type ClaimedOutbox,
  OutboxService,
} from '../src/orders/outbox.service.js';
import { resetDatabase } from './reset-database.js';

describe('outbox claims', () => {
  let app: INestApplication<App>;
  let outbox: OutboxService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    await resetDatabase(app.get(MikroORM));
    outbox = app.get(OutboxService);
  });

  beforeEach(async () => {
    await query('truncate users restart identity cascade');
  });

  afterAll(async () => {
    await app.close();
  });

  it('leaves the poller off when WORKER_POLL_MS is unset', () => {
    expect(process.env.WORKER_POLL_MS).toBeUndefined();
    expect(app.get<AppConfig>(APP_CONFIG).workerPollMs).toBeUndefined();
  });

  it('dispatches one pending row once', async () => {
    const [placed] = await insertPendingOrders(1);

    await expect(outbox.claimOne()).resolves.toEqual(claimed(placed));
    expect(await dispatchCount(placed.outboxId)).toBe(1);
    expect(await processedAt(placed.outboxId)).toBeInstanceOf(Date);
    const orders = app.get(OrdersService);
    await expect(
      RequestContext.create(app.get(MikroORM).em, () =>
        orders.get(placed.userId, placed.orderId),
      ),
    ).resolves.toMatchObject({ id: placed.orderId, dispatch: 'done' });

    await expect(outbox.claimOne()).resolves.toBeNull();
    expect(await dispatchCount(placed.outboxId)).toBe(1);
  });

  it('skips a row another transaction holds, and claims it after that rolls back', async () => {
    const [first, second] = await insertPendingOrders(2);
    const holder = await connect();
    try {
      await holder.query('begin');
      await holder.query('select id from outbox where id = $1 for update', [
        first.outboxId,
      ]);

      await expect(outbox.claimOne()).resolves.toEqual(claimed(second));
      await expect(outbox.claimOne()).resolves.toBeNull();
      expect(await dispatchCount(first.outboxId)).toBe(0);
      expect(await processedAt(first.outboxId)).toBeNull();

      await holder.query('rollback');
      await expect(outbox.claimOne()).resolves.toEqual(claimed(first));
    } finally {
      await holder.end();
    }

    expect(await dispatchCount(first.outboxId)).toBe(1);
    expect(await dispatchCount(second.outboxId)).toBe(1);
  });
});

type PendingOrder = { userId: number; orderId: number; outboxId: number };

/** What `claimOne()` returns for this order. */
function claimed({ orderId, outboxId }: PendingOrder): ClaimedOutbox {
  return { outboxId, orderId };
}

/** Inserts a user, its orders, and one pending outbox row per order. */
async function insertPendingOrders(count: number) {
  const client = await connect();
  try {
    const user = await client.query<{ id: number }>(
      `insert into users (email, password_hash)
       values ('outbox@example.com', 'not-a-real-hash') returning id`,
    );
    const userId = user.rows[0].id;
    const placed: PendingOrder[] = [];
    for (let index = 0; index < count; index += 1) {
      const order = await client.query<{ id: number }>(
        `insert into orders (user_id, idempotency_key, sku, quantity, created_at)
         values ($1, $2, 'widget', 1, now()) returning id`,
        [userId, `key-${index}`],
      );
      const row = await client.query<{ id: number }>(
        `insert into outbox (order_id, created_at) values ($1, now()) returning id`,
        [order.rows[0].id],
      );
      placed.push({
        userId,
        orderId: order.rows[0].id,
        outboxId: row.rows[0].id,
      });
    }
    return placed;
  } finally {
    await client.end();
  }
}

async function dispatchCount(outboxId: number) {
  const rows = await query<{ count: string }>(
    'select count(*)::text as count from dispatches where outbox_id = $1',
    [outboxId],
  );
  return Number(rows[0].count);
}

async function processedAt(outboxId: number) {
  const rows = await query<{ processed_at: Date | null }>(
    'select processed_at from outbox where id = $1',
    [outboxId],
  );
  return rows[0].processed_at;
}

async function connect() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function query<Row extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) {
  const client = await connect();
  try {
    return (await client.query<Row>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
