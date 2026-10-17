import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/users/user.entity.js';

describe('POST /users', () => {
  let app: INestApplication<App>;
  let orm: MikroORM;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    orm = app.get(MikroORM);
    await orm.schema.refresh();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and stores a hash', async () => {
    const password = 'correct-horse';
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'ada@example.com', password })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      email: 'ada@example.com',
    });
    expect(JSON.stringify(response.body)).not.toContain(password);
    expect(response.body).not.toHaveProperty('passwordHash');

    const stored = await orm.em.fork().findOneOrFail(User, { email: 'ada@example.com' });
    expect(stored.passwordHash).not.toBe(password);
    expect(stored.passwordHash.startsWith('$scrypt$')).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(stored.passwordHash);
  });

  it('rejects invalid input and writes nothing', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(422);

    const count = await orm.em.fork().count(User);
    expect(count).toBe(1);
  });

  it('rejects a duplicate email and keeps a single row', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'ada@example.com', password: 'another-secret' })
      .expect(409);

    expect(await orm.em.fork().count(User, { email: 'ada@example.com' })).toBe(1);
  });
});
