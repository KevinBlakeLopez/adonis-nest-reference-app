import { MikroORM } from '@mikro-orm/postgresql';
import { loadDatabaseUrl } from '../config/app-config.js';
import { mikroOrmConfig } from './mikro-orm.config.js';

export async function applyMigrations(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const databaseUrl = await loadDatabaseUrl(env);
  const orm = await MikroORM.init(mikroOrmConfig({ databaseUrl }));
  try {
    const applied = await orm.migrator.up();
    return applied.map((migration) => migration.name);
  } finally {
    await orm.close();
  }
}
