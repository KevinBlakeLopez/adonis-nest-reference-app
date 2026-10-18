import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { databaseUrl } from '../database/database-url.js';

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

  constructor() {
    this.store = new PgStore({
      conString: databaseUrl(),
      createTableIfMissing: false,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }
}
