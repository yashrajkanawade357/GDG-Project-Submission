import { describe, expect, it } from 'vitest';
import { HybridClock, compareStamps } from '../src/sync/clock';

describe('HybridClock', () => {
  it('follows the wall clock when it moves forward', () => {
    let wall = 5_000;
    const clock = new HybridClock('a', () => wall);
    expect(clock.tick().t).toBe(5_000);
    wall = 9_000;
    expect(clock.tick().t).toBe(9_000);
  });

  it('never goes backwards, even if the system clock does', () => {
    let wall = 10_000;
    const clock = new HybridClock('a', () => wall);
    const first = clock.tick();
    wall = 2_000;
    const second = clock.tick();
    expect(second.t).toBeGreaterThan(first.t);
  });

  it('orders a new edit after every stamp it has observed', () => {
    const clock = new HybridClock('a', () => 1_000);
    clock.observe({ t: 50_000, tab: 'b' });
    const stamp = clock.tick();
    expect(compareStamps(stamp, { t: 50_000, tab: 'b' })).toBe(1);
  });

  it('issues distinct stamps for several edits within the same millisecond', () => {
    const clock = new HybridClock('a', () => 1_000);
    const stamps = [clock.tick(), clock.tick(), clock.tick()].map((s) => s.t);
    expect(new Set(stamps).size).toBe(3);
  });
});

describe('compareStamps', () => {
  it('orders by timestamp first', () => {
    expect(compareStamps({ t: 1, tab: 'z' }, { t: 2, tab: 'a' })).toBe(-1);
  });

  it('breaks timestamp ties by tab id, the same way in every tab', () => {
    expect(compareStamps({ t: 7, tab: 'b' }, { t: 7, tab: 'a' })).toBe(1);
    expect(compareStamps({ t: 7, tab: 'a' }, { t: 7, tab: 'b' })).toBe(-1);
    expect(compareStamps({ t: 7, tab: 'a' }, { t: 7, tab: 'a' })).toBe(0);
  });
});
