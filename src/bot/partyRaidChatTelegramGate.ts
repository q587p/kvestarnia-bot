const GLOBAL_INTERVAL_MS = Math.ceil(1_000 / 13);
const SAME_TARGET_INTERVAL_MS = 1_100;

interface QueuedOperation<T> {
  target: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class PartyRaidChatTelegramGate {
  private readonly queue: QueuedOperation<unknown>[] = [];
  private readonly targetAvailableAt = new Map<string, number>();
  private nextGlobalAt = 0;
  private draining = false;

  constructor(private readonly timing: {
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {}) {}

  enqueue<T>(target: string | bigint | number, run: () => Promise<T>): Promise<T> {
    this.pruneTargets(this.now());
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        target: String(target),
        run,
        resolve: resolve as (value: unknown) => void,
        reject
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const now = this.now();
        this.pruneTargets(now);
        let selectedIndex = -1;
        let selectedAt = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.queue.length; index += 1) {
          const operation = this.queue[index]!;
          const availableAt = Math.max(
            this.nextGlobalAt,
            this.targetAvailableAt.get(operation.target) ?? 0
          );
          if (availableAt < selectedAt) {
            selectedAt = availableAt;
            selectedIndex = index;
          }
        }

        if (selectedAt > now) {
          await this.sleep(selectedAt - now);
        }
        const operation = this.queue.splice(selectedIndex, 1)[0]!;
        const startedAt = this.now();
        this.nextGlobalAt = startedAt + GLOBAL_INTERVAL_MS;
        this.targetAvailableAt.set(operation.target, startedAt + SAME_TARGET_INTERVAL_MS);
        try {
          operation.resolve(await operation.run());
        } catch (error) {
          operation.reject(error);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        void this.drain();
      }
    }
  }

  private now(): number {
    return this.timing.now?.() ?? Date.now();
  }

  private sleep(milliseconds: number): Promise<void> {
    return this.timing.sleep?.(milliseconds) ?? delay(milliseconds);
  }

  private pruneTargets(now: number): void {
    for (const [target, availableAt] of this.targetAvailableAt) {
      if (availableAt <= now) {
        this.targetAvailableAt.delete(target);
      }
    }
  }
}

export const partyRaidChatTelegramGate = new PartyRaidChatTelegramGate();

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
