import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { User } from '../users/user.entity.js';

export function mikroOrmConfig(config: { databaseUrl: string }) {
  return defineConfig({
    clientUrl: config.databaseUrl,
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
