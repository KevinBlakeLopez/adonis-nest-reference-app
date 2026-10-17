import { MikroOrmModule } from '@mikro-orm/nestjs';
import { defineConfig } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { databaseUrl } from './database-url.js';
import { User } from '../users/user.entity.js';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: () =>
        defineConfig({
          clientUrl: databaseUrl(),
          entities: [User],
        }),
    }),
  ],
})
export class DatabaseModule {}
