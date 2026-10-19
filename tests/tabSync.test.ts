import { describe, expect, it } from 'vitest';
import { compareRecords } from '../src/sync/merge';
import { FONT_SIZE, parseStored, serializeDoc } from '../src/sync/schema';
import { drillWinner, type SyncEvent } from '../src/sync/tabSync';
import { LANGUAGES, SETTING_KEYS, type FieldRecord, type SettingKey, type Settings } from '../src/sync/types';
import { MemoryBus, MemoryStorage, openTab, seededRandom } from './helpers';

type Tab = ReturnType<typeof openTab>;

const snapshot = (tab: Tab) => serializeDoc(tab.sync.doc);

function expectConverged(tabs: Tab[]): void {
  const [first, ...rest] = tabs.map(snapshot);
  for (const other of rest) expect(other).toBe(first);
}

/** Tabs that share nothing but the message bus, so messages are the only way to sync. */
function isolatedTabs(count: number, bus: MemoryBus, now?: (i: number) => () => number): Tab[] {
  return Array.from({ length: count }, (_, i) =>
    openTab({ id: `tab-${String.fromCharCode(97 + i)}`, bus, storage: new MemoryStorage(), now: now?.(i) }),
  );
}

describe('real-time propagation', () => {
  it('pushes an edit to every other open tab', () => {
    const bus = new MemoryBus();
    const [a, b, c] = isolatedTabs(3, bus) as [Tab, Tab, Tab];
    bus.flush();

    a.sync.set('darkMode', true);
    a.sync.set('language', 'fr');
    bus.flush();

    for (const tab of [b, c]) {
      expect(tab.sync.settings).toEqual({ darkMode: true, language: 'fr', fontSize: FONT_SIZE.default });
    }
    expectConverged([a, b, c]);
  });

  it('measures delivery latency from broadcast to applied', () => {
    const bus = new MemoryBus();
    let clock = 100;
    const a = openTab({ id: 'tab-a', bus, storage: new MemoryStorage(), preciseNow: () => clock });
    const b = openTab({ id: 'tab-b', bus, storage: new MemoryStorage(), preciseNow: () => clock });
    bus.flush();
    const events: SyncEvent[] = [];
    b.sync.subscribe((event) => events.push(event));

    a.sync.set('fontSize', 20);
    clock += 3;
    bus.flush();

    expect(events).toContainEqual({ type: 'latency', ms: 3, from: 'tab-a', key: 'fontSize' });
    expect(b.sync.latency.summary()).toMatchObject({ count: 1, last: 3, withinTarget: 1 });
    expect(a.sync.latency.summary()).toBeNull();
  });

  it('ignores malformed messages', () => {
    const bus = new MemoryBus();
    const [, b] = isolatedTabs(2, bus) as [Tab, Tab];
    bus.flush();
    const before = snapshot(b);

    b.transport.deliver({ kind: 'state', from: 'tab-x', sentAt: 1, doc: { fontSize: { value: 500, stamp: { t: 9e12, tab: 'x' } } } });
    b.transport.deliver({ kind: 'state', from: '../../etc', sentAt: 1, doc: {} });
    b.transport.deliver('garbage');

    expect(snapshot(b)).toBe(before);
  });
});

describe('persistence', () => {
  it('restores the latest settings after every tab has been closed', () => {
    const storage = new MemoryStorage();
    const bus = new MemoryBus();
    const a = openTab({ id: 'tab-a', bus, storage });
    const b = openTab({ id: 'tab-b', bus, storage });
    a.sync.set('fontSize', 20);
    b.sync.set('darkMode', true);
    bus.flush();
    a.sync.dispose();
    b.sync.dispose();

    const reopened = openTab({ id: 'tab-c', bus: new MemoryBus(), storage });
    expect(reopened.sync.settings).toEqual({ darkMode: true, language: 'en', fontSize: 20 });
  });

  it('repairs storage when a concurrent save overwrote a newer write', () => {
    const storage = new MemoryStorage();
    const bus = new MemoryBus();
    const a = openTab({ id: 'tab-a', bus, storage });
    bus.flush();
    const staleCopy = storage.raw;

    a.sync.set('fontSize', 21);
    // Another tab saved an older copy at the same instant and its write landed last.
    storage.raw = staleCopy;
    // That write reaches tab A as a `storage` event.
    a.sync.refreshFromStorage();

    expect(parseStored(storage.raw).fontSize?.value).toBe(21);
  });

  it('lets a tab that read an out-of-date copy catch up from the open tabs', () => {
    const bus = new MemoryBus();
    const a = openTab({ id: 'tab-a', bus, storage: new MemoryStorage() });
    a.sync.set('language', 'ja');
    bus.flush();

    const late = openTab({ id: 'tab-b', bus, storage: new MemoryStorage() });
    bus.flush();

    expect(late.sync.settings.language).toBe('ja');
    expectConverged([a, late]);
  });
});

describe('conflict resolution', () => {
  it('gives every tab the same winner for simultaneous edits, whatever the delivery order', () => {
    const winners = new Set<string>();
    for (const order of ['first-in-first-out', 'last-in-first-out'] as const) {
      const bus = new MemoryBus();
      const [a, b] = isolatedTabs(2, bus) as [Tab, Tab];
      bus.flush();

      // Both edits happen before either tab hears about the other one.
      a.sync.set('fontSize', 14);
      b.sync.set('fontSize', 22);
      bus.flush({ pick: (n) => (order === 'first-in-first-out' ? 0 : n - 1) });

      expectConverged([a, b]);
      winners.add(snapshot(a));
    }
    expect(winners.size).toBe(1);
  });

  it('breaks an exact timestamp tie with the tab id', () => {
    const bus = new MemoryBus();
    const [a, b] = isolatedTabs(2, bus, () => () => 1_000) as [Tab, Tab];
    bus.flush();

    a.sync.set('fontSize', 14);
    b.sync.set('fontSize', 22);
    expect(a.sync.doc.fontSize.stamp.t).toBe(b.sync.doc.fontSize.stamp.t);
    bus.flush();

    expect(a.sync.doc.fontSize).toEqual({ value: 22, stamp: { t: 1_000, tab: 'tab-b' } });
    expectConverged([a, b]);
  });

  it('lets the later of two concurrent edits win', () => {
    const bus = new MemoryBus();
    const [a, b] = isolatedTabs(2, bus, (i) => () => (i === 0 ? 2_000 : 1_000)) as [Tab, Tab];
    bus.flush();

    b.sync.set('fontSize', 22); // at t = 1000
    a.sync.set('fontSize', 14); // at t = 2000
    bus.flush();

    expect(b.sync.settings.fontSize).toBe(14);
    expectConverged([a, b]);
  });

  it('never lets an edit lose to a change it had already seen, even with a slower clock', () => {
    const bus = new MemoryBus();
    const [a, b] = isolatedTabs(2, bus, (i) => () => (i === 0 ? 50_000 : 1_000)) as [Tab, Tab];
    bus.flush();

    a.sync.set('fontSize', 14);
    bus.flush();
    b.sync.set('fontSize', 22); // b's wall clock is far behind, but it has seen a's edit
    bus.flush();

    expect(a.sync.settings.fontSize).toBe(22);
    expectConverged([a, b]);
  });

  it('keeps simultaneous edits to different settings', () => {
    const bus = new MemoryBus();
    const [a, b] = isolatedTabs(2, bus) as [Tab, Tab];
    bus.flush();

    a.sync.set('darkMode', true);
    b.sync.set('language', 'de');
    bus.flush({ pick: (n) => n - 1 });

    expect(a.sync.settings).toMatchObject({ darkMode: true, language: 'de' });
    expectConverged([a, b]);
  });
});

describe('convergence under randomized schedules', () => {
  const OPS = 400;

  function randomEdit(random: () => number): { key: SettingKey; value: Settings[SettingKey] } {
    const key = SETTING_KEYS[Math.floor(random() * SETTING_KEYS.length)] as SettingKey;
    if (key === 'darkMode') return { key, value: random() < 0.5 };
    if (key === 'language') return { key, value: LANGUAGES[Math.floor(random() * LANGUAGES.length)] as Settings['language'] };
    return { key, value: FONT_SIZE.min + Math.floor(random() * (FONT_SIZE.max - FONT_SIZE.min + 1)) };
  }

  /**
   * Runs random edits from random tabs (with skewed clocks), delivering a random subset of
   * pending messages, in random order, between edits. Returns every record that was written.
   */
  function run(
    tabs: Tab[],
    bus: MemoryBus,
    random: () => number,
    wall: { now: number },
    dropRate: number,
    perSenderOrder = true,
  ) {
    const written = new Map<SettingKey, FieldRecord<unknown>[]>();
    for (let op = 0; op < OPS; op++) {
      wall.now += Math.floor(random() * 3); // often the same millisecond
      const tab = tabs[Math.floor(random() * tabs.length)] as Tab;
      const { key, value } = randomEdit(random);
      if (tab.sync.set(key, value as never)) {
        written.set(key, [...(written.get(key) ?? []), tab.sync.doc[key]]);
      }
      bus.flush({
        limit: Math.floor(random() * 6),
        pick: (n) => Math.floor(random() * n),
        drop: () => random() < dropRate,
        perSenderOrder,
      });
    }
    return written;
  }

  function expectNewestWriteEverywhere(tabs: Tab[], written: Map<SettingKey, FieldRecord<unknown>[]>) {
    for (const [key, records] of written) {
      const newest = records.reduce((best, r) => (compareRecords(r, best) > 0 ? r : best));
      for (const tab of tabs) expect(tab.sync.doc[key]).toEqual(newest);
    }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`converges on the newest write using messages alone (seed ${seed})`, () => {
      const random = seededRandom(seed);
      const wall = { now: 1_000 };
      const bus = new MemoryBus();
      const skew = [0, 5, -3, 40];
      const tabs = isolatedTabs(4, bus, (i) => () => wall.now + (skew[i] ?? 0));
      bus.flush();

      const written = run(tabs, bus, random, wall, 0);
      bus.flush({ pick: (n) => Math.floor(random() * n) });

      expectConverged(tabs);
      expectNewestWriteEverywhere(tabs, written);
      for (const tab of tabs) expect(tab.sync.inSyncWithPeers).toBe(true);
    });

    it(`converges even if messages arrive in a completely arbitrary order (seed ${seed})`, () => {
      const random = seededRandom(seed * 31);
      const wall = { now: 1_000 };
      const bus = new MemoryBus();
      const tabs = isolatedTabs(4, bus, () => () => wall.now);
      bus.flush();

      const written = run(tabs, bus, random, wall, 0, false);
      bus.flush({ pick: (n) => Math.floor(random() * n), perSenderOrder: false });

      expectConverged(tabs);
      expectNewestWriteEverywhere(tabs, written);
    });

    it(`recovers from lost messages when tabs re-announce (seed ${seed})`, () => {
      const random = seededRandom(seed * 101);
      const wall = { now: 1_000 };
      const bus = new MemoryBus();
      const tabs = isolatedTabs(4, bus, () => () => wall.now);
      bus.flush();

      const written = run(tabs, bus, random, wall, 0.3);
      bus.flush({ drop: () => random() < 0.3 });
      // Anti-entropy round: each tab announces its state and peers answer with theirs.
      for (const tab of tabs) tab.sync.announce();
      bus.flush();

      expectConverged(tabs);
      expectNewestWriteEverywhere(tabs, written);
    });

    it(`recovers from lost messages through shared storage (seed ${seed})`, () => {
      const random = seededRandom(seed * 7919);
      const wall = { now: 1_000 };
      const bus = new MemoryBus();
      const storage = new MemoryStorage();
      const tabs = ['tab-a', 'tab-b', 'tab-c'].map((id) => openTab({ id, bus, storage, now: () => wall.now }));
      bus.flush();

      const written = run(tabs, bus, random, wall, 0.5);
      bus.discardPending();
      // What the `storage` event (or the tab becoming visible again) triggers.
      for (const tab of tabs) tab.sync.refreshFromStorage();

      expectConverged(tabs);
      expectNewestWriteEverywhere(tabs, written);
    });
  }
});

describe('presence', () => {
  it('lists the other tabs and shows when all of them agree', () => {
    const bus = new MemoryBus();
    const [a, b, c] = isolatedTabs(3, bus) as [Tab, Tab, Tab];
    bus.flush();

    a.sync.set('language', 'hi');
    expect(a.sync.inSyncWithPeers).toBe(false);
    bus.flush();

    expect(a.sync.peerList.map((p) => p.id)).toEqual(['tab-b', 'tab-c']);
    for (const tab of [a, b, c]) expect(tab.sync.inSyncWithPeers).toBe(true);
  });

  it('drops a tab when it closes', () => {
    const bus = new MemoryBus();
    const [a, b] = isolatedTabs(2, bus) as [Tab, Tab];
    bus.flush();
    expect(a.sync.peerList).toHaveLength(1);

    b.sync.dispose();
    bus.flush();

    expect(a.sync.peerList).toHaveLength(0);
  });
});

describe('conflict drill', () => {
  it('has every tab write at once and still agree on one winner', () => {
    const random = seededRandom(99);
    const bus = new MemoryBus();
    const storage = new MemoryStorage();
    const tabs = ['tab-a', 'tab-b', 'tab-c'].map((id, i) =>
      openTab({ id, bus, storage: i === 0 ? storage : new MemoryStorage(), random }),
    );
    bus.flush();

    tabs[0]?.sync.runDrill();
    bus.flush({ pick: (n) => Math.floor(random() * n) });

    expectConverged(tabs);
    const winners = tabs.map((tab) => {
      const drill = tab.sync.drill;
      expect(drill?.proposals).toHaveLength(3);
      return drill && drillWinner(drill);
    });
    for (const winner of winners) expect(winner).toEqual(winners[0]);
    expect(tabs[0]?.sync.settings.fontSize).toBe(winners[0]?.value);
  });
});
