import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';
import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './reset-database.js';

type SessionRow = {
  sid: string;
  sess: { userId?: number; csrfToken?: string };
};

describe('PostgreSQL session-store failures', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    await resetDatabase(app.get(MikroORM));
  });

  afterAll(async () => {
    await allowSessionDeletes();
    await app.close();
  });

  it('keeps the anonymous session usable when login cannot delete it', async () => {
    const email = 'regen-fail@example.com';
    const password = 'correct-horse';
    await register(app, email, password);
    const opened = await openSession(app);
    const anonymous = await sessionByToken(opened.csrfToken);
    expect(anonymous?.sess.userId).toBeUndefined();

    await rejectSessionDeletes();
    try {
      const failed = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Cookie', opened.cookie)
        .set('X-CSRF-Token', opened.csrfToken)
        .send({ email, password })
        .expect(500);

      const failedCookie = sidCookie(failed);
      expect(failedCookie === undefined || failedCookie === opened.cookie).toBe(
        true,
      );
      expect(failed.body.csrfToken).toBeUndefined();

      const after = await sessionByToken(opened.csrfToken);
      expect(after?.sid).toBe(anonymous?.sid);
      expect(after?.sess.userId).toBeUndefined();
      expect(await rowsWithUser()).toHaveLength(0);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', opened.cookie)
        .expect(401);
      const csrf = await request(app.getHttpServer())
        .get('/auth/csrf')
        .set('Cookie', opened.cookie)
        .expect(200);
      expect(csrf.body.csrfToken).toBe(opened.csrfToken);
    } finally {
      await allowSessionDeletes();
    }

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', opened.cookie)
      .set('X-CSRF-Token', opened.csrfToken)
      .send({ email, password })
      .expect(200);
    expect(login.body.email).toBe(email);
    const rotated = await sessionByToken(login.body.csrfToken as string);
    expect(rotated?.sid).not.toBe(anonymous?.sid);
    expect(rotated?.sess.userId).toBe(login.body.id);
    expect(await sessionByToken(opened.csrfToken)).toBeUndefined();
  });

  it('keeps the authenticated session usable when logout cannot delete it', async () => {
    const email = 'logout-fail@example.com';
    const loggedIn = await loginAs(app, email);
    const stored = await sessionByToken(loggedIn.csrfToken);
    expect(stored?.sess.userId).toBe(loggedIn.userId);

    await rejectSessionDeletes();
    try {
      const failed = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', loggedIn.cookie)
        .set('X-CSRF-Token', loggedIn.csrfToken)
        .expect(500);
      expect(sidCookie(failed)).toBeUndefined();

      const after = await sessionByToken(loggedIn.csrfToken);
      expect(after?.sid).toBe(stored?.sid);
      expect(after?.sess.userId).toBe(loggedIn.userId);
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', loggedIn.cookie)
        .expect(200);
      expect(me.body).toEqual({ id: loggedIn.userId, email });
    } finally {
      await allowSessionDeletes();
    }

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', loggedIn.cookie)
      .set('X-CSRF-Token', loggedIn.csrfToken)
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', loggedIn.cookie)
      .expect(401);
    expect(await sessionByToken(loggedIn.csrfToken)).toBeUndefined();
  });
});

async function register(
  app: INestApplication<App>,
  email: string,
  password: string,
) {
  const opened = await openSession(app);
  await request(app.getHttpServer())
    .post('/users')
    .set('Cookie', opened.cookie)
    .set('X-CSRF-Token', opened.csrfToken)
    .send({ email, password })
    .expect(201);
}

async function openSession(app: INestApplication<App>) {
  const response = await request(app.getHttpServer())
    .get('/auth/csrf')
    .expect(200);
  const cookie = sidCookie(response);
  if (!cookie) {
    throw new Error('session cookie was not set');
  }
  return { cookie, csrfToken: response.body.csrfToken as string };
}

async function loginAs(app: INestApplication<App>, email: string) {
  const password = 'correct-horse';
  await register(app, email, password);
  const opened = await openSession(app);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .set('Cookie', opened.cookie)
    .set('X-CSRF-Token', opened.csrfToken)
    .send({ email, password })
    .expect(200);
  const cookie = sidCookie(login);
  if (!cookie) {
    throw new Error('login did not set a session cookie');
  }
  return {
    cookie,
    csrfToken: login.body.csrfToken as string,
    userId: login.body.id as number,
  };
}

function sidCookie(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'];
  const joined = Array.isArray(header) ? header.join('\n') : header;
  return joined ? /sid=[^;\s]+/.exec(joined)?.[0] : undefined;
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function sessionByToken(token: string): Promise<SessionRow | undefined> {
  return withDb(async (client) => {
    const result = await client.query<SessionRow>(
      `select sid, sess from "session" where sess->>'csrfToken' = $1`,
      [token],
    );
    return result.rows[0];
  });
}

async function rowsWithUser(): Promise<SessionRow[]> {
  return withDb(async (client) => {
    const result = await client.query<SessionRow>(
      `select sid, sess from "session" where sess->>'userId' is not null`,
    );
    return result.rows;
  });
}

async function rejectSessionDeletes(): Promise<void> {
  await withDb((client) =>
    client.query(`
      create or replace function reject_session_delete()
      returns trigger language plpgsql as $$
      begin
        raise exception 'injected session delete failure';
      end;
      $$;
      drop trigger if exists reject_session_delete on "session";
      create trigger reject_session_delete
      before delete on "session"
      for each row execute function reject_session_delete();
    `),
  );
}

async function allowSessionDeletes(): Promise<void> {
  await withDb((client) =>
    client.query(`
      drop trigger if exists reject_session_delete on "session";
      drop function if exists reject_session_delete();
    `),
  );
}
