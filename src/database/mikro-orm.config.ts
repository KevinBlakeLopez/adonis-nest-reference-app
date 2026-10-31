import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { Note } from '../notes/note.entity.js';
import { Dispatch } from '../orders/dispatch.entity.js';
import { Order } from '../orders/order.entity.js';
import { Outbox } from '../orders/outbox.entity.js';
import { User } from '../users/user.entity.js';

export function mikroOrmConfig(config: { databaseUrl: string }) {
  return defineConfig({
    clientUrl: config.databaseUrl,
    entities: [User, Note, Order, Outbox, Dispatch],
    extensions: [Migrator],
    migrations: {
      path: './dist/database/migrations',
      pathTs: './src/database/migrations',
      emit: 'ts',
      snapshot: false,
    },
  });
}
