import pg from 'pg';
import { applyMigrations } from '../src/database/apply-migrations.js';

describe('pnpm migration:up', () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    PORT: process.env.PORT,
    TRUST_PROXY: process.env.TRUST_PROXY,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    restore('DATABASE_URL', previous.DATABASE_URL);
    restore('SESSION_SECRET', previous.SESSION_SECRET);
    restore('PORT', previous.PORT);
    restore('TRUST_PROXY', previous.TRUST_PROXY);
    restore('NODE_ENV', previous.NODE_ENV);
  });

  it('runs with DATABASE_URL set and HTTP configuration absent', async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    delete process.env.SESSION_SECRET;
    delete process.env.PORT;
    delete process.env.TRUST_PROXY;
    delete process.env.NODE_ENV;

    const applied = await applyMigrations();
    expect(Array.isArray(applied)).toBe(true);

    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    try {
      const result = await client.query<{ name: string }>(
        'select name from mikro_orm_migrations order by name',
      );
      expect(result.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'Migration20261017160000_create_users',
          'Migration20261018060000_create_session',
        ]),
      );
    } finally {
      await client.end();
    }
  });
});

function restore(name: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
