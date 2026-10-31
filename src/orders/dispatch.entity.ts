import { defineEntity, p } from '@mikro-orm/core';
import { Outbox } from './outbox.entity.js';

export const Dispatch = defineEntity({
  name: 'Dispatch',
  tableName: 'dispatches',
  properties: {
    id: p.integer().primary().autoincrement(),
    outbox: p.oneToOne(Outbox).deleteRule('cascade'),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
