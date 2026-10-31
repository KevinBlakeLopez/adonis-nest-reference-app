import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { OutboxPoller } from '../src/orders/outbox.poller.js';
import { resetDatabase } from './reset-database.js';

/**
 * The only e2e file that runs the in-process poller. Every other file leaves
 * WORKER_POLL_MS unset.
 */
describe('outbox poller', () => {
  const previousPollMs = process.env.WORKER_POLL_MS;
  let app: INestApplication<App> | undefined;

  beforeAll(async () => {
    delete process.env.WORKER_POLL_MS;
    const setup = await createApp();
    try {
      await resetDatabase(setup.get(MikroORM));
    } finally {
      await setup.close();
    }
  });

  beforeEach(async () => {
    await query('truncate users restart identity cascade');
    process.env.WORKER_POLL_MS = '50';
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(() => {
    if (previousPollMs === undefined) {
      delete process.env.WORKER_POLL_MS;
    } else {
      process.env.WORKER_POLL_MS = previousPollMs;
    }
  });

  it('dispatches a pending row without an explicit claim', async () => {
    const outboxId = await insertPendingOrder();
    app = await createApp();

    await waitFor(async () => (await dispatchCount(outboxId)) === 1);
    expect(await processedAt(outboxId)).toBeInstanceOf(Date);
  });

  it('waits on close for a claim in progress, and that claim commits', async () => {
    const outboxId = await insertPendingOrder();
    const holder = await connect();
    let closing: Promise<void> | undefined;
    try {
      await holder.query('begin');
      await holder.query('lock table dispatches in access exclusive mode');
      app = await createApp();
      await waitFor(blockedDispatchInsert);

      let closed = false;
      closing = app.close().then(() => {
        closed = true;
      });
      app = undefined;
      await sleep(300);
      expect(closed).toBe(false);
      // Reading dispatches would wait on the holder's lock; outbox is readable.
      expect(await processedAt(outboxId)).toBeNull();
    } finally {
      await holder.query('rollback');
      await holder.end();
    }

    await closing;
    expect(await dispatchCount(outboxId)).toBe(1);
    expect(await processedAt(outboxId)).toBeInstanceOf(Date);
  });

  // app.close() also waits when the poller does not, because closing the
  // pool waits for the claim's connection. This checks the poller's own hook.
  it("holds the poller's shutdown hook until the claim in progress commits", async () => {
    const outboxId = await insertPendingOrder();
    const holder = await connect();
    let stopping: Promise<void> | undefined;
    try {
      await holder.query('begin');
      await holder.query('lock table dispatches in access exclusive mode');
      app = await createApp();
      await waitFor(blockedDispatchInsert);

      let stopped = false;
      stopping = app
        .get(OutboxPoller)
        .beforeApplicationShutdown()
        .then(() => {
          stopped = true;
        });
      await sleep(300);
      expect(stopped).toBe(false);
    } finally {
      await holder.query('rollback');
      await holder.end();
    }

    await stopping;
    expect(await dispatchCount(outboxId)).toBe(1);
  });
});

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const created = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(created);
  await created.init();
  return created;
}

/** True once a claim is waiting on the lock to insert its dispatch row. */
async function blockedDispatchInsert(): Promise<boolean> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count
     from pg_stat_activity
     where datname = current_database()
       and wait_event_type = 'Lock'
       and query ilike 'insert into "dispatches"%'`,
  );
  return Number(rows[0].count) === 1;
}

async function insertPendingOrder(): Promise<number> {
  const client = await connect();
  try {
    const user = await client.query<{ id: number }>(
      `insert into users (email, password_hash)
       values ('poller@example.com', 'not-a-real-hash') returning id`,
    );
    const order = await client.query<{ id: number }>(
      `insert into orders (user_id, idempotency_key, sku, quantity, created_at)
       values ($1, 'poller-key', 'widget', 1, now()) returning id`,
      [user.rows[0].id],
    );
    const outbox = await client.query<{ id: number }>(
      `insert into outbox (order_id, created_at) values ($1, now()) returning id`,
      [order.rows[0].id],
    );
    return outbox.rows[0].id;
  } finally {
    await client.end();
  }
}

async function dispatchCount(outboxId: number): Promise<number> {
  const rows = await query<{ count: string }>(
    'select count(*)::text as count from dispatches where outbox_id = $1',
    [outboxId],
  );
  return Number(rows[0].count);
}

async function processedAt(outboxId: number): Promise<Date | null> {
  const rows = await query<{ processed_at: Date | null }>(
    'select processed_at from outbox where id = $1',
    [outboxId],
  );
  return rows[0].processed_at;
}

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${timeoutMs} ms`);
    }
    await sleep(20);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
