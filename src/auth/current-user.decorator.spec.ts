import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import type { PublicUser } from './auth.service.js';
import { authenticatedUser, CurrentUser } from './current-user.decorator.js';

describe('authenticatedUser', () => {
  const user: PublicUser = { id: 4, email: 'ada@example.com' };

  it('returns the identity already attached to the request', () => {
    expect(authenticatedUser({ authenticatedUser: user } as never)).toEqual(
      user,
    );
  });

  it('does not treat a missing identity as a user', () => {
    expect(() => authenticatedUser({} as never)).toThrow(
      /Authentication required/,
    );
  });
});

describe('CurrentUser decorator', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request that has no authenticated identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/identity')
      .expect(401);
    expect(response.body).not.toHaveProperty('unauthenticated');
    expect(response.body).not.toHaveProperty('email');
  });
});

@Controller('identity')
class IdentityController {
  @Get()
  show(@CurrentUser() user: PublicUser | undefined) {
    return user ?? { unauthenticated: true };
  }
}
