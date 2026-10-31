import { defineEntity, p } from '@mikro-orm/core';
import { User } from '../users/user.entity.js';

export const Order = defineEntity({
  name: 'Order',
  tableName: 'orders',
  uniques: [
    {
      properties: ['user', 'idempotencyKey'],
      name: 'orders_user_id_idempotency_key_unique',
    },
  ],
  properties: {
    id: p.integer().primary().autoincrement(),
    user: p.manyToOne(User).deleteRule('cascade'),
    idempotencyKey: p.string().length(255),
    sku: p.string().length(200),
    quantity: p.integer(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
