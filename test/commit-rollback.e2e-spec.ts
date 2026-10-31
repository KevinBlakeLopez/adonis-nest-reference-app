import { createRequire } from 'node:module';
import {
  defineEntity,
  p,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import pg from 'pg';

const require = createRequire(import.meta.url);
const postgresqlVersion = require('@mikro-orm/postgresql/package.json')
  .version as string;

const CommitProbe = defineEntity({
  name: 'CommitProbe',
  tableName: 'commit_probe',
  properties: {
    id: p.integer().primary().autoincrement(),
    email: p.string().unique(),
    note: p.text().nullable(),
  },
});

/**
 * PostgreSQL answers COMMIT with command tag ROLLBACK after a statement
 * error, and it does not raise. This catches that unique violation and lets
 * the transaction API finish, which is the case 7.2.5 reported as success.
 */
describe('MikroORM 7.2.6 commit tag', () => {
  let client: pg.Client;
  let orm: MikroORM;

  beforeAll(async () => {
    expect(postgresqlVersion).toBe('7.2.6');
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('drop table if exists commit_probe');
    await client.query(`
      create table commit_probe (
        id serial primary key,
        email varchar(255) not null unique,
        note text
      )
    `);
    await client.query(
      `insert into commit_probe (email) values ('taken@example.com')`,
    );
    orm = await MikroORM.init({
      clientUrl: process.env.DATABASE_URL,
      entities: [CommitProbe],
      ensureDatabase: false,
    });
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
    if (client) {
      await client.query('drop table if exists commit_probe');
      await client.end();
    }
  });

  it('rejects em.transactional() when COMMIT is answered with ROLLBACK', async () => {
    await expect(
      orm.em.fork().transactional(async (em) => {
        await em.execute(
          `insert into commit_probe (email, note) values ('fresh-transactional@example.com', 'should-roll-back')`,
        );
        await insertDuplicate(em);
        return 'committed';
      }),
    ).rejects.toMatchObject({
      code: '25P02',
      message: expect.stringContaining('COMMIT was answered with ROLLBACK'),
    });

    expect(await noteFor('fresh-transactional@example.com')).toBeUndefined();
    expect(await noteFor('taken@example.com')).toBeNull();
  });

  it('rejects em.commit() when COMMIT is answered with ROLLBACK', async () => {
    const em = orm.em.fork();
    await em.begin();
    try {
      await em.execute(
        `insert into commit_probe (email, note) values ('fresh-commit@example.com', 'should-roll-back')`,
      );
      await insertDuplicate(em);
      await expect(em.commit()).rejects.toMatchObject({
        code: '25P02',
        message: expect.stringContaining('COMMIT was answered with ROLLBACK'),
      });
    } finally {
      await rollbackIfOpen(em);
    }

    expect(await noteFor('fresh-commit@example.com')).toBeUndefined();
    expect(await noteFor('taken@example.com')).toBeNull();
  });
});

async function insertDuplicate(em: EntityManager): Promise<void> {
  try {
    await em.execute(
      `insert into commit_probe (email) values ('taken@example.com')`,
    );
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) {
      return;
    }
    throw error;
  }
  throw new Error('expected the duplicate insert to violate the unique key');
}

async function noteFor(email: string): Promise<string | null | undefined> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ note: string | null }>(
      'select note from commit_probe where email = $1',
      [email],
    );
    return result.rows[0]?.note;
  } finally {
    await client.end();
  }
}

async function rollbackIfOpen(em: EntityManager): Promise<void> {
  try {
    await em.rollback();
  } catch {
    // COMMIT answered with ROLLBACK already ended the transaction.
  }
}
