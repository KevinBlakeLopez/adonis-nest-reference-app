import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { PublicUser } from '../auth/auth.service.js';
import { AuthenticatedGuard } from '../auth/authenticated.guard.js';
import {
  VineValidationPipe,
  type VineOutput,
} from '../vine/vine-validation.pipe.js';
import { IdempotencyKey } from './idempotency-key.decorator.js';
import { createOrder, idempotencyKey } from './order-input.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(AuthenticatedGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @CurrentUser() user: PublicUser,
    @IdempotencyKey(new VineValidationPipe(idempotencyKey))
    key: VineOutput<typeof idempotencyKey>,
    @Body(new VineValidationPipe(createOrder))
    input: VineOutput<typeof createOrder>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const placed = await this.orders.create(user.id, key, input);
    response.status(placed.created ? 201 : 200);
    return placed.order;
  }

  @Get(':id')
  get(@CurrentUser() user: PublicUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.get(user.id, id);
  }
}
