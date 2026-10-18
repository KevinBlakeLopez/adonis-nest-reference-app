import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  APP_CONFIG,
  type AppConfig,
  loadAppConfig,
} from './config/app-config.js';
import { configureApp } from './configure-app.js';

export async function bootstrap() {
  await loadAppConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
  return app;
}
