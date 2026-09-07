/**
 * A serialising gate that enforces a minimum spacing between tasks.
 *
 * One instance per upstream service. The ADS-B aggregators share exactly one
 * (see adsb/client.ts) because their limit is published per-client across the
 * whole API; a second service with its own limit gets its own instance rather
 * than competing for the aggregators' budget.
 *
 * Tasks queue rather than being dropped, and a failing task never breaks the
 * chain for the ones behind it.
 */
export class RateGate {
  private chain: Promise<void> = Promise.resolve();
  private lastStart = 0;

  constructor(private readonly spacingMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const wait = this.lastStart + this.spacingMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastStart = Date.now();
      return task();
    });

    // Keep the chain alive regardless of how this task settles.
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
