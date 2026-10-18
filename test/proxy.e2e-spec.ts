import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { configureApp } from '../src/configure-app.js';
import { ProbeModule } from './probe.module.js';
import { resetDatabase } from './reset-database.js';

function cookieHeader(response: request.Response): string {
  const header = response.headers['set-cookie'];
  return Array.isArray(header) ? header.join('\n') : (header ?? '');
}

function sidCookie(response: request.Response): string | undefined {
  return /sid=[^;\s]+/.exec(cookieHeader(response))?.[0];
}

describe('one-hop reverse proxy', () => {
  describe('outside production', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      const moduleFixture = await Test.createTestingModule({
        imports: [ProbeModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
      await resetDatabase(app.get(MikroORM));
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not trust X-Forwarded-Proto and does not set a Secure cookie', async () => {
      expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBeFalsy();
      const response = await request(app.getHttpServer())
        .get('/auth/csrf')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);
      expect(cookieHeader(response)).toMatch(/HttpOnly/);
      expect(cookieHeader(response)).not.toMatch(/;\s*Secure/i);
    });
  });

  describe('production behind one proxy', () => {
    let app: INestApplication<App>;
    const previousNodeEnv = process.env.NODE_ENV;

    beforeAll(async () => {
      process.env.NODE_ENV = 'production';
      const moduleFixture = await Test.createTestingModule({
        imports: [ProbeModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
      await resetDatabase(app.get(MikroORM));
    });

    afterAll(async () => {
      await app?.close();
      process.env.NODE_ENV = previousNodeEnv;
    });

    it('sets a Secure cookie only when the trusted hop says the request is https', async () => {
      expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);

      const hidden = await request(app.getHttpServer())
        .get('/auth/csrf')
        .set('Host', 'app.example')
        .expect(200);
      expect(cookieHeader(hidden)).not.toMatch(/sid=/);

      const visible = await request(app.getHttpServer())
        .get('/auth/csrf')
        .set('Host', 'app.example')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);
      expect(cookieHeader(visible)).toMatch(/;\s*Secure/i);
      expect(cookieHeader(visible)).toMatch(/HttpOnly/);
      expect(cookieHeader(visible)).toMatch(/SameSite=Lax/);
    });

    it('compares Origin with Host and ignores X-Forwarded-Host', async () => {
      const csrf = await request(app.getHttpServer())
        .get('/auth/csrf')
        .set('X-Forwarded-Proto', 'https')
        .set('Host', 'app.example')
        .expect(200);
      const token = csrf.body.csrfToken as string;
      const cookie = sidCookie(csrf);
      expect(cookie).toBeDefined();

      const foreignOrigin = await request(app.getHttpServer())
        .post('/probe')
        .set('Cookie', cookie ?? '')
        .set('X-Forwarded-Proto', 'https')
        .set('Host', 'app.example')
        .set('Origin', 'https://evil.example')
        .set('X-CSRF-Token', token)
        .expect(403);
      expect(foreignOrigin.body.message).toMatch(/Cross-origin request/);

      const forwardedHost = await request(app.getHttpServer())
        .post('/probe')
        .set('Cookie', cookie ?? '')
        .set('X-Forwarded-Proto', 'https')
        .set('Host', 'internal.invalid')
        .set('X-Forwarded-Host', 'app.example')
        .set('Origin', 'https://app.example')
        .set('X-CSRF-Token', token)
        .expect(403);
      expect(forwardedHost.body.message).toMatch(/Cross-origin request/);

      await request(app.getHttpServer())
        .post('/probe')
        .set('Cookie', cookie ?? '')
        .set('X-Forwarded-Proto', 'https')
        .set('Host', 'app.example')
        .set('X-Forwarded-Host', 'evil.example')
        .set('Origin', 'https://app.example')
        .set('X-CSRF-Token', token)
        .expect(200)
        .expect({ ok: true });
    });
  });
});
