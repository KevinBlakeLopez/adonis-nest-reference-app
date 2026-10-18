import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

type SessionStore = session.Store & {
  close(): Promise<void>;
};

const PgStore = connectPgSimple(session) as new (options: {
  conString: string;
  createTableIfMissing: boolean;
}) => SessionStore;

@Injectable()
export class SessionStoreHost implements OnApplicationShutdown {
  readonly store: SessionStore;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.store = new PgStore({
      conString: config.databaseUrl,
      createTableIfMissing: false,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }
}
