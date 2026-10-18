import type { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { SessionStoreHost } from './session/session-store.js';
import {
  sessionCookieName,
  sessionCookieSettings,
  sessionSecret,
  trustProxySetting,
} from './session/session-options.js';

export function configureApp(app: INestApplication): void {
  app.enableCsrfProtection();
  const trustProxy = trustProxySetting();
  if (trustProxy !== false) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }
  const sessions = app.get(SessionStoreHost);
  app.use(
    session({
      store: sessions.store,
      name: sessionCookieName,
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: sessionCookieSettings(),
    }),
  );
}
