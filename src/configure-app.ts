import type { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { SessionStoreHost } from './session/session-store.js';

export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCsrfProtection();
  if (config.trustProxy !== false) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy);
  }
  const sessions = app.get(SessionStoreHost);
  app.use(
    session({
      store: sessions.store,
      name: config.session.cookieName,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: config.session.cookie,
    }),
  );
}
