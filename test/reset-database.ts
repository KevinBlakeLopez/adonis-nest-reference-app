import { MikroORM } from '@mikro-orm/core';

export async function resetDatabase(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();
  await connection.execute('drop schema if exists public cascade');
  await connection.execute('create schema public');
  await orm.migrator.up();
}
