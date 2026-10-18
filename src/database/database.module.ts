import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { mikroOrmConfig } from './mikro-orm.config.js';

@Module({
  imports: [
    AppConfigModule,
    MikroOrmModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => mikroOrmConfig(config),
    }),
  ],
})
export class DatabaseModule {}
