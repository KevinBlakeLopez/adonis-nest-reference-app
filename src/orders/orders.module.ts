import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OutboxPoller } from './outbox.poller.js';
import { OutboxService } from './outbox.service.js';

@Module({
  imports: [AuthModule, AppConfigModule],
  controllers: [OrdersController],
  providers: [OrdersService, OutboxService, OutboxPoller],
})
export class OrdersModule {}
