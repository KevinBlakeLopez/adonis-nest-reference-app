import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { mikroOrmConfig } from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: () => mikroOrmConfig(),
    }),
  ],
})
export class DatabaseModule {}
