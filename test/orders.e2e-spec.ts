import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { Agent } from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { applyMigrations } from '../src/database/apply-migrations.js';

const password = 'correct-horse';

describe('orders', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    orm = app.get(MikroORM);
    await prepareDatabaseWithUsersAndSession(orm);
    const applied = await applyMigrations();
    expect(applied).toEqual([
      'Migration20261018070000_create_notes',
      'Migration20261031100000_create_orders',
    ]);
    expect(await applyMigrations()).toEqual([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates orders, outbox, and dispatches', async () => {
    const client = await connect();
    try {
      const tables = await client.query<{
        orders: string | null;
        outbox: string | null;
        dispatches: string | null;
      }>(
        `select to_regclass('public.orders') as orders,
                to_regclass('public.outbox') as outbox,
                to_regclass('public.dispatches') as dispatches`,
      );
      expect(tables.rows[0]).toEqual({
        orders: 'orders',
        outbox: 'outbox',
        dispatches: 'dispatches',
      });

      const columns = await client.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
      }>(
        `select table_name, column_name, data_type, character_maximum_length, is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and table_name in ('orders', 'outbox', 'dispatches')
         order by table_name, ordinal_position`,
      );
      expect(columns.rows).toEqual([
        column('dispatches', 'id', 'integer', null, 'NO'),
        column('dispatches', 'outbox_id', 'integer', null, 'NO'),
        column(
          'dispatches',
          'created_at',
          'timestamp with time zone',
          null,
          'NO',
        ),
        column('orders', 'id', 'integer', null, 'NO'),
        column('orders', 'user_id', 'integer', null, 'NO'),
        column('orders', 'idempotency_key', 'character varying', 255, 'NO'),
        column('orders', 'sku', 'character varying', 200, 'NO'),
        column('orders', 'quantity', 'integer', null, 'NO'),
        column('orders', 'created_at', 'timestamp with time zone', null, 'NO'),
        column('outbox', 'id', 'integer', null, 'NO'),
        column('outbox', 'order_id', 'integer', null, 'NO'),
        column(
          'outbox',
          'processed_at',
          'timestamp with time zone',
          null,
          'YES',
        ),
        column('outbox', 'created_at', 'timestamp with time zone', null, 'NO'),
      ]);

      const constraints = await client.query<{
        name: string;
        definition: string;
      }>(
        `select conname as name, pg_get_constraintdef(oid) as definition
         from pg_constraint
         where conname in (
           'orders_user_id_foreign',
           'orders_user_id_idempotency_key_unique',
           'orders_quantity_check',
           'outbox_order_id_foreign',
           'outbox_order_id_unique',
           'dispatches_outbox_id_foreign',
           'dispatches_outbox_id_unique'
         )
         order by conname`,
      );
      expect(constraints.rows).toEqual([
        {
          name: 'dispatches_outbox_id_foreign',
          definition:
            'FOREIGN KEY (outbox_id) REFERENCES outbox(id) ON DELETE CASCADE',
        },
        {
          name: 'dispatches_outbox_id_unique',
          definition: 'UNIQUE (outbox_id)',
        },
        {
          name: 'orders_quantity_check',
          definition: 'CHECK ((quantity > 0))',
        },
        {
          name: 'orders_user_id_foreign',
          definition:
            'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
        },
        {
          name: 'orders_user_id_idempotency_key_unique',
          definition: 'UNIQUE (user_id, idempotency_key)',
        },
        {
          name: 'outbox_order_id_foreign',
          definition:
            'FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE',
        },
        {
          name: 'outbox_order_id_unique',
          definition: 'UNIQUE (order_id)',
        },
      ]);
    } finally {
      await client.end();
    }
  });

  it('rejects unauthenticated reads and writes', async () => {
    await request(app.getHttpServer()).get('/orders/1').expect(401);

    const anonymous = await openSession(app);
    await anonymous.agent
      .post('/orders')
      .set('X-CSRF-Token', anonymous.csrfToken)
      .set('Idempotency-Key', 'anon')
      .send({ sku: 'secret', quantity: 1 })
      .expect(401);

    expect(await countOrders()).toBe(0);
  });

  it('requires a CSRF token to place an order', async () => {
    const owner = await login(app, 'csrf-orders@example.com');
    await owner.agent
      .post('/orders')
      .set('Idempotency-Key', 'missing-csrf')
      .send({ sku: 'widget', quantity: 1 })
      .expect(403);

    expect(await countOrdersFor(owner.userId)).toBe(0);
  });

  it('places an order once and replays the same idempotency key', async () => {
    const owner = await login(app, 'place-orders@example.com');
    const created = await owner.agent
      .post('/orders')
      .set('X-CSRF-Token', owner.csrfToken)
      .set('Idempotency-Key', 'order-1')
      .send({ sku: 'widget', quantity: 2 })
      .expect(201);
    expect(created.body).toMatchObject({
      id: expect.any(Number),
      sku: 'widget',
      quantity: 2,
    });
    expect(created.body).not.toHaveProperty('user');
    expect(created.body).not.toHaveProperty('userId');
    expect(created.body).not.toHaveProperty('dispatch');
    expect(created.body.createdAt).toEqual(expect.any(String));

    const stored = await orderRow(created.body.id);
    expect(stored).toMatchObject({
      user_id: owner.userId,
      idempotency_key: 'order-1',
      sku: 'widget',
      quantity: 2,
    });
    expect(await outboxFor(created.body.id)).toMatchObject({
      processed_at: null,
    });
    expect(await countDispatchesFor(created.body.id)).toBe(0);

    const fetched = await owner.agent
      .get(`/orders/${created.body.id}`)
      .expect(200);
    expect(fetched.body).toEqual({
      ...created.body,
      dispatch: 'pending',
    });

    const replay = await owner.agent
      .post('/orders')
      .set('X-CSRF-Token', owner.csrfToken)
      .set('Idempotency-Key', 'order-1')
      .send({ sku: 'other', quantity: 9 })
      .expect(200);
    expect(replay.body).toEqual(created.body);
    expect(await countOrdersFor(owner.userId)).toBe(1);
    expect(await outboxFor(created.body.id)).toMatchObject({
      processed_at: null,
    });
    expect(await countOutboxFor(created.body.id)).toBe(1);
    expect(await countDispatchesFor(created.body.id)).toBe(0);
  });

  it('returns 422 for a quantity of 0 and leaves no row', async () => {
    const owner = await login(app, 'invalid-orders@example.com');
    const response = await owner.agent
      .post('/orders')
      .set('X-CSRF-Token', owner.csrfToken)
      .set('Idempotency-Key', 'zero')
      .send({ sku: 'widget', quantity: 0 })
      .expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      errors: [
        {
          message: 'The quantity field must be at least 1',
          rule: 'min',
          field: 'quantity',
          meta: { min: 1 },
        },
      ],
    });
    expect(await countOrdersFor(owner.userId)).toBe(0);
  });

  it('returns 422 when the idempotency key is missing and leaves no row', async () => {
    const owner = await login(app, 'missing-key-orders@example.com');
    const response = await owner.agent
      .post('/orders')
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ sku: 'widget', quantity: 1 })
      .expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      errors: [
        {
          message: 'The data field must be defined',
          rule: 'required',
          field: '',
        },
      ],
    });
    expect(await countOrdersFor(owner.userId)).toBe(0);
  });

  it('hides another user and a missing order', async () => {
    const ada = await login(app, 'ada-orders@example.com');
    const grace = await login(app, 'grace-orders@example.com');
    const adaOrder = await ada.agent
      .post('/orders')
      .set('X-CSRF-Token', ada.csrfToken)
      .set('Idempotency-Key', 'ada-only')
      .send({ sku: 'widget', quantity: 1 })
      .expect(201);

    await grace.agent.get(`/orders/${adaOrder.body.id}`).expect(404);
    await ada.agent.get('/orders/999999').expect(404);

    const stored = await orderRow(adaOrder.body.id);
    expect(stored).toMatchObject({
      user_id: ada.userId,
      sku: 'widget',
    });
  });

  it('rolls back the order when the outbox insert fails', async () => {
    const owner = await login(app, 'outbox-failure-orders@example.com');
    const client = await connect();
    try {
      await client.query(
        'alter table outbox add constraint outbox_rejects_all check (false) not valid',
      );
      await owner.agent
        .post('/orders')
        .set('X-CSRF-Token', owner.csrfToken)
        .set('Idempotency-Key', 'outbox-fails')
        .send({ sku: 'widget', quantity: 1 })
        .expect(500);
    } finally {
      await client.query(
        'alter table outbox drop constraint if exists outbox_rejects_all',
      );
      await client.end();
    }

    expect(await countOrdersFor(owner.userId)).toBe(0);
    const retried = await owner.agent
      .post('/orders')
      .set('X-CSRF-Token', owner.csrfToken)
      .set('Idempotency-Key', 'outbox-fails')
      .send({ sku: 'widget', quantity: 1 })
      .expect(201);
    expect(await countOutboxFor(retried.body.id)).toBe(1);
  });
});

function column(
  table: string,
  name: string,
  dataType: string,
  length: number | null,
  nullable: 'YES' | 'NO',
) {
  return {
    table_name: table,
    column_name: name,
    data_type: dataType,
    character_maximum_length: length,
    is_nullable: nullable,
  };
}

async function prepareDatabaseWithUsersAndSession(
  orm: MikroORM,
): Promise<void> {
  const connection = orm.em.getConnection();
  await connection.execute('drop schema if exists public cascade');
  await connection.execute('create schema public');
  const applied = await orm.migrator.up({
    to: 'Migration20261018060000_create_session',
  });
  expect(applied.map((migration) => migration.name)).toEqual([
    'Migration20261017160000_create_users',
    'Migration20261018060000_create_session',
  ]);
}

async function openSession(app: INestApplication<App>) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.get('/auth/csrf').expect(200);
  return { agent, csrfToken: response.body.csrfToken as string };
}

async function login(app: INestApplication<App>, email: string) {
  const registration = await openSession(app);
  await registration.agent
    .post('/users')
    .set('X-CSRF-Token', registration.csrfToken)
    .send({ email, password })
    .expect(201);
  const session = await openSession(app);
  const response = await session.agent
    .post('/auth/login')
    .set('X-CSRF-Token', session.csrfToken)
    .send({ email, password })
    .expect(200);
  return {
    agent: session.agent as Agent,
    csrfToken: response.body.csrfToken as string,
    userId: response.body.id as number,
  };
}

async function connect() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function orderRow(id: number) {
  const client = await connect();
  try {
    const result = await client.query<{
      id: number;
      user_id: number;
      idempotency_key: string;
      sku: string;
      quantity: number;
    }>(
      'select id, user_id, idempotency_key, sku, quantity from orders where id = $1',
      [id],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function outboxFor(orderId: number) {
  const client = await connect();
  try {
    const result = await client.query<{
      id: number;
      order_id: number;
      processed_at: Date | null;
    }>('select id, order_id, processed_at from outbox where order_id = $1', [
      orderId,
    ]);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function countOrders() {
  return count('select count(*)::text as count from orders');
}

async function countOrdersFor(userId: number) {
  return count(
    'select count(*)::text as count from orders where user_id = $1',
    [userId],
  );
}

async function countOutboxFor(orderId: number) {
  return count(
    'select count(*)::text as count from outbox where order_id = $1',
    [orderId],
  );
}

async function countDispatchesFor(orderId: number) {
  return count(
    `select count(*)::text as count
     from dispatches
     join outbox on outbox.id = dispatches.outbox_id
     where outbox.order_id = $1`,
    [orderId],
  );
}

async function count(sql: string, params: unknown[] = []) {
  const client = await connect();
  try {
    const result = await client.query<{ count: string }>(sql, params);
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}
