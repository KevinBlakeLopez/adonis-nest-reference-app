import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { OutboxPoller } from './outbox.poller.js';
import type { ClaimedOutbox, OutboxService } from './outbox.service.js';

const pollMs = 100;
const claimed: ClaimedOutbox = { outboxId: 1, orderId: 1 };

describe('OutboxPoller', () => {
  let claimOne: ReturnType<typeof vi.fn<() => Promise<ClaimedOutbox | null>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    claimOne = vi.fn<() => Promise<ClaimedOutbox | null>>(() =>
      Promise.resolve(null),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function poller(workerPollMs: number | undefined) {
    return new OutboxPoller(
      { workerPollMs } as AppConfig,
      {
        claimOne,
      } as unknown as OutboxService,
    );
  }

  it('does not claim when WORKER_POLL_MS is unset', async () => {
    poller(undefined).onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(10 * pollMs);

    expect(claimOne).not.toHaveBeenCalled();
  });

  it('claims until no row is free, then waits for the next tick', async () => {
    claimOne
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(null);
    const subject = poller(pollMs);
    subject.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(pollMs - 1);
    expect(claimOne).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(claimOne).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(pollMs);
    expect(claimOne).toHaveBeenCalledTimes(4);

    await subject.beforeApplicationShutdown();
  });

  it('does not start a tick while the previous one is still claiming', async () => {
    const slow = deferred<ClaimedOutbox | null>();
    claimOne.mockReturnValueOnce(slow.promise);
    const subject = poller(pollMs);
    subject.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(pollMs);
    await vi.advanceTimersByTimeAsync(10 * pollMs);
    expect(claimOne).toHaveBeenCalledTimes(1);

    slow.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(claimOne).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(pollMs);
    expect(claimOne).toHaveBeenCalledTimes(2);

    await subject.beforeApplicationShutdown();
  });

  it('waits for the claim in progress on shutdown and claims nothing after it', async () => {
    const slow = deferred<ClaimedOutbox | null>();
    claimOne.mockReturnValueOnce(slow.promise);
    const subject = poller(pollMs);
    subject.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(pollMs);

    let stopped = false;
    const shutdown = subject.beforeApplicationShutdown().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    slow.resolve(claimed);
    await shutdown;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * pollMs);
    expect(claimOne).toHaveBeenCalledTimes(1);
  });

  it('logs a failed claim and keeps polling', async () => {
    const error = new Error('connection lost');
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    claimOne.mockRejectedValueOnce(error);
    const subject = poller(pollMs);
    subject.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(pollMs);
    expect(logged).toHaveBeenCalledWith('Outbox claim failed', error);

    await vi.advanceTimersByTimeAsync(pollMs);
    expect(claimOne).toHaveBeenCalledTimes(2);

    await subject.beforeApplicationShutdown();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
