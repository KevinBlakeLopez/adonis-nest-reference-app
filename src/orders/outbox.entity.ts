import { defineEntity, p } from '@mikro-orm/core';
import { Order } from './order.entity.js';

export const Outbox = defineEntity({
  name: 'Outbox',
  tableName: 'outbox',
  properties: {
    id: p.integer().primary().autoincrement(),
    order: p.oneToOne(Order).deleteRule('cascade'),
    processedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
