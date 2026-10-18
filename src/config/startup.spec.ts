import { NestFactory } from '@nestjs/core';
import { bootstrap } from '../bootstrap.js';

describe('application startup', () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };

  afterEach(() => {
    restore('DATABASE_URL', previous.DATABASE_URL);
    restore('SESSION_SECRET', previous.SESSION_SECRET);
  });

  it('fails before the application is created when configuration is invalid', async () => {
    delete process.env.DATABASE_URL;
    process.env.SESSION_SECRET = 'test-only-session-secret-32b-min';
    const create = vi.spyOn(NestFactory, 'create');

    await expect(bootstrap()).rejects.toThrow(/DATABASE_URL is required/);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it('fails before the application is created when the session secret is missing', async () => {
    process.env.DATABASE_URL =
      'postgres://postgres:postgres@127.0.0.1:55440/adonis_nest';
    delete process.env.SESSION_SECRET;
    const create = vi.spyOn(NestFactory, 'create');

    await expect(bootstrap()).rejects.toThrow(/SESSION_SECRET is required/);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});

function restore(
  name: 'DATABASE_URL' | 'SESSION_SECRET',
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
