import { EntityManager, LockMode } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Dispatch } from './dispatch.entity.js';
import { Outbox } from './outbox.entity.js';

export type ClaimedOutbox = {
  outboxId: number;
  orderId: number;
};

@Injectable()
export class OutboxService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Dispatches the oldest unprocessed outbox row, or returns `null` when no
   * row is free. The row is locked with `FOR UPDATE SKIP LOCKED`, so an
   * overlapping claim takes a different row instead of waiting for this one.
   * The dispatch row and `processed_at` commit together. If this transaction
   * does not commit, the row stays pending for the next claim.
   */
  async claimOne(): Promise<ClaimedOutbox | null> {
    return this.em.fork().transactional(async (em) => {
      const [outbox] = await em.find(
        Outbox,
        { processedAt: null },
        {
          orderBy: { id: 'asc' },
          limit: 1,
          lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
        },
      );
      if (!outbox) {
        return null;
      }
      em.create(Dispatch, { outbox });
      outbox.processedAt = new Date();
      await em.flush();
      return { outboxId: outbox.id, orderId: outbox.order.id };
    });
  }
}
