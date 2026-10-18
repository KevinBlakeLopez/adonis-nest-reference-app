import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';
import { ProbeModule } from './probe.module.js';
import { resetDatabase } from './reset-database.js';

describe('CSRF deny by default', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    const orm = app.get(MikroORM);
    await resetDatabase(orm);
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    try {
      const existing = await client.query<{ name: string | null }>(
        `select to_regclass('public.session') as name`,
      );
      expect(existing.rows[0]?.name).toBe('session');
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a safe method on a route the guard does not name', async () => {
    await request(app.getHttpServer()).get('/probe').expect(200).expect({
      ok: true,
    });
  });

  it('rejects every unsafe method without a token, including a new POST route', async () => {
    const server = app.getHttpServer();
    await request(server).post('/probe').expect(403);
    await request(server).put('/probe').expect(403);
    await request(server).patch('/probe').expect(403);
    await request(server).delete('/probe').expect(403);
  });

  it('accepts the new POST route when the session token is supplied', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrf = await agent.get('/auth/csrf').expect(200);

    await agent
      .post('/probe')
      .set('X-CSRF-Token', csrf.body.csrfToken)
      .expect(200)
      .expect({ ok: true });
  });
});
