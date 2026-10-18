/**
 * Apply pending MikroORM migrations.
 *
 * DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55440/adonis_nest pnpm migration:up
 *
 * This command validates DATABASE_URL only. It does not read SESSION_SECRET,
 * PORT, or TRUST_PROXY.
 *
 * Run this once, as a deployment step, before starting the new application
 * instances. Do not run it in every replica. MikroORM does not serialize
 * concurrent migrators. If a run fails while another migrator may have been
 * active, inspect mikro_orm_migrations and the schema before running it
 * again. A 23505 error does not by itself mean the other run finished.
 *
 * Application startup does not run this. The migration files are the schema.
 */
import { applyMigrations } from './apply-migrations.js';

const applied = await applyMigrations();

if (applied.length === 0) {
  console.log('No pending migrations');
} else {
  console.log(applied.map((migration) => migration.name).join('\n'));
}
