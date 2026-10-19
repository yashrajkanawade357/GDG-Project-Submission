export const LATENCY_TARGET_MS = 100;

export interface LatencySummary {
  count: number;
  last: number;
  mean: number;
  p95: number;
  max: number;
  /** Share of samples (0..1) delivered within LATENCY_TARGET_MS. */
  withinTarget: number;
}

/** Rolling window of cross-tab delivery times, in milliseconds. */
export class LatencyStats {
  private readonly samples: number[] = [];

  constructor(private readonly capacity = 500) {}

  record(ms: number): void {
    // Tabs read the same system clock, but each converts its own high-resolution timer to
    // epoch time, so tiny negative values are rounding noise.
    this.samples.push(Math.max(0, ms));
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  recent(count: number): number[] {
    return this.samples.slice(-count);
  }

  summary(): LatencySummary | null {
    const count = this.samples.length;
    if (count === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((total, ms) => total + ms, 0);
    const p95 = sorted[Math.min(count - 1, Math.ceil(count * 0.95) - 1)] ?? 0;
    return {
      count,
      last: this.samples[count - 1] ?? 0,
      mean: sum / count,
      p95,
      max: sorted[count - 1] ?? 0,
      withinTarget: sorted.filter((ms) => ms <= LATENCY_TARGET_MS).length / count,
    };
  }
}
