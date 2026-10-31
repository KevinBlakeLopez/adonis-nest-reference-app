import {
  EntityManager,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity.js';
import { Dispatch } from './dispatch.entity.js';
import { Order } from './order.entity.js';
import { Outbox } from './outbox.entity.js';

export type OrderResponse = {
  id: number;
  sku: string;
  quantity: number;
  createdAt: string;
};

export type OrderDetails = OrderResponse & {
  dispatch: 'pending' | 'done';
};

export type PlacedOrder = {
  created: boolean;
  order: OrderResponse;
};

@Injectable()
export class OrdersService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Inserts the order and its outbox row in one transaction, then returns.
   * A duplicate idempotency key is not caught inside that transaction: it
   * throws, MikroORM rolls the transaction back, and the existing order is
   * read only after that.
   */
  async create(
    userId: number,
    idempotencyKey: string,
    input: { sku: string; quantity: number },
  ): Promise<PlacedOrder> {
    try {
      const order = await this.em.transactional(async (em) => {
        const created = em.create(Order, {
          user: em.getReference(User, userId),
          idempotencyKey,
          sku: input.sku,
          quantity: input.quantity,
        });
        em.create(Outbox, { order: created });
        await em.flush();
        return created;
      });
      return { created: true, order: toOrderResponse(order) };
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) {
        throw error;
      }
      const existing = await this.em.fork().findOne(Order, {
        user: userId,
        idempotencyKey,
      });
      if (!existing) {
        throw error;
      }
      return { created: false, order: toOrderResponse(existing) };
    }
  }

  async get(userId: number, id: number): Promise<OrderDetails> {
    const order = await this.em.findOne(Order, { id, user: userId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const outbox = await this.em.findOne(Outbox, { order: order.id });
    const dispatch = outbox
      ? await this.em.findOne(Dispatch, { outbox: outbox.id })
      : null;
    return {
      ...toOrderResponse(order),
      dispatch: dispatch ? 'done' : 'pending',
    };
  }
}

function toOrderResponse(order: {
  id: number;
  sku: string;
  quantity: number;
  createdAt: Date;
}): OrderResponse {
  return {
    id: order.id,
    sku: order.sku,
    quantity: order.quantity,
    createdAt: order.createdAt.toISOString(),
  };
}
