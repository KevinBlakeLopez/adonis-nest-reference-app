import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { NotesModule } from './notes/notes.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { SessionModule } from './session/session.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SessionModule,
    UsersModule,
    AuthModule,
    NotesModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
