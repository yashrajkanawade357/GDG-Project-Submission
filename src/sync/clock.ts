import type { Stamp } from './types';

/** Total order over stamps: later timestamp first, then tab id as a deterministic tie-breaker. */
export function compareStamps(a: Stamp, b: Stamp): number {
  if (a.t !== b.t) return a.t < b.t ? -1 : 1;
  if (a.tab !== b.tab) return a.tab < b.tab ? -1 : 1;
  return 0;
}

/**
 * Hybrid logical clock (single-integer variant).
 *
 * Each new stamp is at least the current wall-clock time, so concurrent edits are ordered by
 * when they really happened, and strictly greater than any stamp this tab has observed, so an
 * edit made after seeing another tab's change always wins over it, even if the system clock
 * jumps backwards.
 */
export class HybridClock {
  private last = 0;

  constructor(
    readonly tabId: string,
    private readonly now: () => number = Date.now,
  ) {}

  tick(): Stamp {
    this.last = Math.max(Math.floor(this.now()), this.last + 1);
    return { t: this.last, tab: this.tabId };
  }

  observe(stamp: Stamp): void {
    if (stamp.t > this.last) this.last = stamp.t;
  }
}
