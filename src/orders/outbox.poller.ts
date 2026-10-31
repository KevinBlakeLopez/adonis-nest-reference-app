import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { OutboxService } from './outbox.service.js';

/**
 * Claims outbox rows in this process every `WORKER_POLL_MS`. It is off when
 * that variable is unset. Each tick claims until no row is free. The next
 * tick is scheduled only after that, so ticks never overlap.
 *
 * Shutdown waits for the current claim before MikroORM closes its connection
 * in `onApplicationShutdown`.
 */
@Injectable()
export class OutboxPoller
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(OutboxPoller.name);
  private timer: NodeJS.Timeout | undefined;
  private tick: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.workerPollMs !== undefined) {
      this.schedule(this.config.workerPollMs);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.tick;
  }

  private schedule(pollMs: number): void {
    this.timer = setTimeout(() => {
      this.tick = this.drain().finally(() => {
        this.tick = undefined;
        if (!this.stopped) {
          this.schedule(pollMs);
        }
      });
    }, pollMs);
  }

  private async drain(): Promise<void> {
    try {
      while (!this.stopped && (await this.outbox.claimOne())) {
        // Claim the next free row.
      }
    } catch (error) {
      this.logger.error('Outbox claim failed', error);
    }
  }
}
