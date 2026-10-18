import { defineEntity, p } from '@mikro-orm/core';
import { User } from '../users/user.entity.js';

export const Note = defineEntity({
  name: 'Note',
  tableName: 'notes',
  properties: {
    id: p.integer().primary().autoincrement(),
    user: p.manyToOne(User).deleteRule('cascade'),
    title: p.string().length(200),
    body: p.text(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});
