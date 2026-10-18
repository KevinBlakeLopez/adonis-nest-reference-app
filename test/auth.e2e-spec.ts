import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';
import { sessionMaxAgeMs } from '../src/config/app-config.js';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';
import { resetDatabase } from './reset-database.js';

type SessionRow = {
  sid: string;
  sess: { userId?: number; csrfToken?: string };
  remainingSeconds: number;
};

describe('cookie session authentication', () => {
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
    await resetDatabase(orm);
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues an anonymous CSRF token on a server-side session', async () => {
    const agent = request.agent(app.getHttpServer());
    const first = await agent.get('/auth/csrf').expect(200);
    const second = await agent.get('/auth/csrf').expect(200);

    expect(first.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.body.csrfToken).toBe(first.body.csrfToken);
    const cookie = cookieHeader(first);
    expect(cookie).toMatch(/sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(cookie).not.toContain(first.body.csrfToken);
    const expires = /Expires=([^;]+)/i.exec(cookie);
    expect(expires?.[1]).toBeDefined();
    const expiresAt = new Date(expires?.[1] ?? '');
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(
      sessionMaxAgeMs - 60_000,
    );
    expect(expiresAt.getTime() - Date.now()).toBeLessThan(
      sessionMaxAgeMs + 60_000,
    );

    const rows = await sessionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sess.csrfToken).toBe(first.body.csrfToken);
    expect(rows[0]?.sess.userId).toBeUndefined();
    const remainingMs = Number(rows[0]?.remainingSeconds) * 1000;
    expect(remainingMs).toBeGreaterThan(sessionMaxAgeMs - 60_000);
    expect(remainingMs).toBeLessThan(sessionMaxAgeMs + 60_000);
  });

  it('requires a CSRF token before registration', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'no-token@example.com', password: 'correct-horse' })
      .expect(403);

    expect(
      await orm.em.fork().count(User, { email: 'no-token@example.com' }),
    ).toBe(0);

    const { agent, csrfToken } = await openSession(app);
    const response = await agent
      .post('/users')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'with-token@example.com', password: 'correct-horse' })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      email: 'with-token@example.com',
    });
  });

  it('rejects missing, invalid, and non-header CSRF tokens before login', async () => {
    const { agent, csrfToken } = await openSession(app);
    const body = { email: 'ada@example.com', password: 'correct-horse' };

    await agent.post('/auth/login').send(body).expect(403);
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', 'not-the-token')
      .send(body)
      .expect(403);
    await agent.post('/auth/login').query({ csrfToken }).send(body).expect(403);
    await agent
      .post('/auth/login')
      .send({ ...body, csrfToken })
      .expect(403);
    await agent.get('/auth/me').expect(401);
  });

  it('rejects invalid credentials without rotating the anonymous session', async () => {
    const email = 'invalid-login@example.com';
    await register(app, email, 'correct-horse');
    const { agent, csrfToken } = await openSession(app);
    const before = await sessionRows();
    const anonymous = before.find((row) => row.sess.csrfToken === csrfToken);
    expect(anonymous).toBeDefined();

    const unknown = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'missing@example.com', password: 'correct-horse' })
      .expect(401);
    const wrong = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: 'wrong-password' })
      .expect(401);

    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toMatchObject({
      statusCode: 401,
      message: 'Authentication failed',
    });
    const after = await sessionRows();
    expect(after.some((row) => row.sid === anonymous?.sid)).toBe(true);
    expect(after.find((row) => row.sid === anonymous?.sid)?.sess.userId).toBe(
      undefined,
    );
    await agent.get('/auth/me').expect(401);
  });

  it('rotates the session on login and rejects the anonymous token', async () => {
    const email = 'rotate@example.com';
    const password = 'correct-horse';
    await register(app, email, password);
    const opened = await openSession(app);
    const { agent, csrfToken } = opened;
    const beforeCookie = cookieHeader(opened.response);
    const anonymousSid = (await sessionRows()).find(
      (row) => row.sess.csrfToken === csrfToken,
    )?.sid;

    const login = await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email, password })
      .expect(200);

    expect(login.body).toMatchObject({ email });
    expect(login.body.csrfToken).not.toBe(csrfToken);
    expect(JSON.stringify(login.body)).not.toContain(password);
    expect(cookieHeader(login)).not.toBe(beforeCookie);
    expect(cookieHeader(login)).not.toContain(login.body.csrfToken);

    const after = await sessionRows();
    expect(after.some((row) => row.sid === anonymousSid)).toBe(false);
    const authenticated = after.find(
      (row) => row.sess.userId === login.body.id,
    );
    expect(authenticated?.sess.csrfToken).toBe(login.body.csrfToken);

    await agent.post('/auth/logout').set('X-CSRF-Token', csrfToken).expect(403);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body).toEqual({ id: login.body.id, email });

    await agent
      .post('/auth/logout')
      .set('X-CSRF-Token', login.body.csrfToken)
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403)
      .expect((response) => {
        expect(response.body.message).toMatch(/Cross-origin request/);
      });
    await agent.get('/auth/me').expect(200);

    await agent
      .post('/auth/logout')
      .set('X-CSRF-Token', login.body.csrfToken)
      .set('Sec-Fetch-Site', 'same-origin')
      .expect(204);
    await agent.get('/auth/me').expect(401);
    expect(
      (await sessionRows()).some((row) => row.sess.userId === login.body.id),
    ).toBe(false);
  });

  it('rejects a CSRF token from a different session', async () => {
    const first = await loginAs(app, 'first@example.com');
    const second = await loginAs(app, 'second@example.com');

    await first.agent
      .post('/auth/logout')
      .set('X-CSRF-Token', second.csrfToken)
      .expect(403);
    await first.agent.get('/auth/me').expect(200);
    await second.agent.get('/auth/me').expect(200);
  });

  it('rejects an expired session stored in Postgres', async () => {
    const { agent } = await loginAs(app, 'expired@example.com');
    await expireSessions();

    await agent.get('/auth/me').expect(401);
  });
});

async function openSession(app: INestApplication<App>) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.get('/auth/csrf').expect(200);
  return {
    agent,
    response,
    csrfToken: response.body.csrfToken as string,
  };
}

async function register(
  app: INestApplication<App>,
  email: string,
  password: string,
) {
  const { agent, csrfToken } = await openSession(app);
  await agent
    .post('/users')
    .set('X-CSRF-Token', csrfToken)
    .send({ email, password })
    .expect(201);
}

async function loginAs(app: INestApplication<App>, email: string) {
  const password = 'correct-horse';
  await register(app, email, password);
  const { agent, csrfToken } = await openSession(app);
  const login = await agent
    .post('/auth/login')
    .set('X-CSRF-Token', csrfToken)
    .send({ email, password })
    .expect(200);
  return { agent, csrfToken: login.body.csrfToken as string };
}

function cookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header.join('\n') : (header ?? '');
}

async function sessionRows(): Promise<SessionRow[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<SessionRow>(
      `select sid, sess,
              extract(epoch from (expire - (now() at time zone 'utc'))) as "remainingSeconds"
       from "session"`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function expireSessions(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('update "session" set expire = to_timestamp(0)');
  } finally {
    await client.end();
  }
}
