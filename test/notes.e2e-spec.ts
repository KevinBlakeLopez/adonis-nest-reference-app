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

describe('notes', () => {
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

  it('records the notes migration once after users and session', async () => {
    expect(await applyMigrations()).toEqual([]);
    const client = await connect();
    try {
      const tables = await client.query<{
        users: string | null;
        session: string | null;
        notes: string | null;
      }>(
        `select to_regclass('public.users') as users,
                to_regclass('public.session') as session,
                to_regclass('public.notes') as notes`,
      );
      expect(tables.rows[0]).toMatchObject({
        users: 'users',
        session: 'session',
        notes: 'notes',
      });
      const history = await client.query<{ name: string }>(
        'select name from mikro_orm_migrations order by id',
      );
      expect(history.rows.map((row) => row.name)).toEqual([
        'Migration20261017160000_create_users',
        'Migration20261018060000_create_session',
        'Migration20261018070000_create_notes',
        'Migration20261031100000_create_orders',
      ]);
      const constraint = await client.query<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition
         from pg_constraint
         where conname = 'notes_user_id_foreign'`,
      );
      expect(constraint.rows[0]?.definition).toMatch(
        /FOREIGN KEY \(user_id\) REFERENCES users\(id\) ON DELETE CASCADE/,
      );
    } finally {
      await client.end();
    }
  });

  it('rejects unauthenticated reads and writes', async () => {
    await request(app.getHttpServer()).get('/notes').expect(401);

    const anonymous = await openSession(app);
    await anonymous.agent
      .post('/notes')
      .set('X-CSRF-Token', anonymous.csrfToken)
      .send({ title: 'Secret', body: 'no' })
      .expect(401);

    expect(await countNotes()).toBe(0);
  });

  it('requires a CSRF token for create, update, and delete', async () => {
    const owner = await login(app, 'csrf-notes@example.com');
    await owner.agent
      .post('/notes')
      .send({ title: 'Missing token', body: 'no' })
      .expect(403);

    const created = await owner.agent
      .post('/notes')
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ title: 'Kept', body: 'body' })
      .expect(201);

    await owner.agent
      .patch(`/notes/${created.body.id}`)
      .send({ title: 'Changed' })
      .expect(403);
    await owner.agent.delete(`/notes/${created.body.id}`).expect(403);

    const stored = await noteRow(created.body.id);
    expect(stored).toMatchObject({ title: 'Kept', body: 'body' });
  });

  it('creates, lists, reads, updates, and deletes an owned note', async () => {
    const owner = await login(app, 'crud-notes@example.com');
    const created = await owner.agent
      .post('/notes')
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ title: '  First  ', body: 'hello' })
      .expect(201);
    expect(created.body).toMatchObject({
      id: expect.any(Number),
      title: 'First',
      body: 'hello',
    });
    expect(created.body).not.toHaveProperty('user');
    expect(created.body).not.toHaveProperty('userId');
    expect(created.body.createdAt).toEqual(created.body.updatedAt);

    const listed = await owner.agent.get('/notes').expect(200);
    expect(listed.body).toEqual([created.body]);

    const fetched = await owner.agent
      .get(`/notes/${created.body.id}`)
      .expect(200);
    expect(fetched.body).toEqual(created.body);

    const updated = await owner.agent
      .patch(`/notes/${created.body.id}`)
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ title: 'Second', body: 'changed' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: 'Second',
      body: 'changed',
    });
    expect(Date.parse(updated.body.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updatedAt),
    );

    const row = await noteRow(created.body.id);
    expect(row).toMatchObject({
      title: 'Second',
      body: 'changed',
      user_id: owner.userId,
    });

    await owner.agent
      .delete(`/notes/${created.body.id}`)
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(204);
    await owner.agent.get(`/notes/${created.body.id}`).expect(404);
    expect(await noteRow(created.body.id)).toBeUndefined();
  });

  it('returns the established 422 body for invalid notes', async () => {
    const owner = await login(app, 'invalid-notes@example.com');
    const response = await owner.agent
      .post('/notes')
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ title: '   ', body: 'hello' })
      .expect(422);

    expect(response.body).toEqual({
      statusCode: 422,
      errors: [
        {
          message: 'The title field must have at least 1 characters',
          rule: 'minLength',
          field: 'title',
          meta: { min: 1 },
        },
      ],
    });
    expect(await countNotesFor(owner.userId)).toBe(0);
  });

  it('returns 404 for a missing note', async () => {
    const owner = await login(app, 'missing-notes@example.com');
    await owner.agent.get('/notes/999999').expect(404);
    await owner.agent
      .patch('/notes/999999')
      .set('X-CSRF-Token', owner.csrfToken)
      .send({ title: 'Nope' })
      .expect(404);
    await owner.agent
      .delete('/notes/999999')
      .set('X-CSRF-Token', owner.csrfToken)
      .expect(404);
  });

  it('hides another user from list, read, update, and delete', async () => {
    const ada = await login(app, 'ada-notes@example.com');
    const grace = await login(app, 'grace-notes@example.com');
    const adaNote = await ada.agent
      .post('/notes')
      .set('X-CSRF-Token', ada.csrfToken)
      .send({ title: 'Ada only', body: 'private' })
      .expect(201);
    const graceNote = await grace.agent
      .post('/notes')
      .set('X-CSRF-Token', grace.csrfToken)
      .send({ title: 'Grace only', body: 'also private' })
      .expect(201);

    const adaList = await ada.agent.get('/notes').expect(200);
    expect(adaList.body.map((note: { id: number }) => note.id)).toEqual([
      adaNote.body.id,
    ]);

    await ada.agent.get(`/notes/${graceNote.body.id}`).expect(404);
    await ada.agent
      .patch(`/notes/${graceNote.body.id}`)
      .set('X-CSRF-Token', ada.csrfToken)
      .send({ title: 'Stolen', body: 'rewritten' })
      .expect(404);
    await ada.agent
      .delete(`/notes/${graceNote.body.id}`)
      .set('X-CSRF-Token', ada.csrfToken)
      .expect(404);

    const stored = await noteRow(graceNote.body.id);
    expect(stored).toMatchObject({
      title: 'Grace only',
      body: 'also private',
      user_id: grace.userId,
    });
    const graceList = await grace.agent.get('/notes').expect(200);
    expect(graceList.body).toEqual([graceNote.body]);
  });
});

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
  const client = await connect();
  try {
    const tables = await client.query<{ notes: string | null }>(
      `select to_regclass('public.notes') as notes`,
    );
    expect(tables.rows[0]?.notes).toBeNull();
  } finally {
    await client.end();
  }
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

async function noteRow(id: number) {
  const client = await connect();
  try {
    const result = await client.query<{
      id: number;
      user_id: number;
      title: string;
      body: string;
    }>('select id, user_id, title, body from notes where id = $1', [id]);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function countNotes() {
  const client = await connect();
  try {
    const result = await client.query<{ count: string }>(
      'select count(*)::text as count from notes',
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

async function countNotesFor(userId: number) {
  const client = await connect();
  try {
    const result = await client.query<{ count: string }>(
      'select count(*)::text as count from notes where user_id = $1',
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}
