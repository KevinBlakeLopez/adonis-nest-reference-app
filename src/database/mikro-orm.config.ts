import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { User } from '../users/user.entity.js';
import { databaseUrl } from './database-url.js';

export function mikroOrmConfig() {
  return defineConfig({
    clientUrl: databaseUrl(),
    entities: [User],
    extensions: [Migrator],
    migrations: {
      path: './dist/database/migrations',
      pathTs: './src/database/migrations',
      emit: 'ts',
      snapshot: false,
    },
  });
}
