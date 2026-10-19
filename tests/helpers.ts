import type { Persistence } from '../src/sync/persistence';
import { defaultDoc } from '../src/sync/schema';
import { SettingsStore } from '../src/sync/store';
import { TabSync } from '../src/sync/tabSync';
import { parseMessage, type SyncMessage, type Transport } from '../src/sync/transport';

/** Synchronous stand-in for localStorage. Share one instance between tabs of the same "browser". */
export class MemoryStorage implements Persistence {
  raw: string | null = null;

  read(): string | null {
    return this.raw;
  }

  write(raw: string): boolean {
    this.raw = raw;
    return true;
  }
}

interface Envelope {
  from: MemoryTransport;
  to: MemoryTransport;
  data: unknown;
}

interface FlushOptions {
  /** Chooses which pending message is delivered next (index into the queue). */
  pick?: (pending: number) => number;
  /** Return true to lose the message. */
  drop?: () => boolean;
  /** Stop after this many deliveries (default: until the queue is empty). */
  limit?: number;
  /**
   * Keep each sender's messages in order for a given receiver, as BroadcastChannel guarantees.
   * Messages from different senders still interleave freely. Default true.
   */
  perSenderOrder?: boolean;
}

/**
 * In-memory stand-in for BroadcastChannel. Messages queue up until the test flushes them, so a
 * test controls exactly when, in what order, and whether each message arrives.
 */
export class MemoryBus {
  private readonly members = new Set<MemoryTransport>();
  private queue: Envelope[] = [];

  connect(): MemoryTransport {
    const transport = new MemoryTransport(this);
    this.members.add(transport);
    return transport;
  }

  send(from: MemoryTransport, message: SyncMessage): void {
    // JSON round trip: like structured cloning, receivers never share objects with the sender.
    const data: unknown = JSON.parse(JSON.stringify(message));
    for (const to of this.members) {
      if (to !== from) this.queue.push({ from, to, data });
    }
  }

  disconnect(transport: MemoryTransport): void {
    this.members.delete(transport);
    this.queue = this.queue.filter((envelope) => envelope.to !== transport);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Loses every message still in flight. */
  discardPending(): void {
    this.queue = [];
  }

  /** Delivers queued messages, including any sent in response, until the queue is empty. */
  flush({
    pick = () => 0,
    drop = () => false,
    limit = Infinity,
    perSenderOrder = true,
  }: FlushOptions = {}): void {
    for (let guard = 0; this.queue.length > 0 && guard < limit; guard++) {
      if (guard > 100_000) throw new Error('Message storm: tabs keep replying to each other');
      let index = pick(this.queue.length);
      const chosen = this.queue[index];
      if (perSenderOrder && chosen) {
        // Deliver the oldest message on the chosen sender -> receiver link instead.
        index = this.queue.findIndex((e) => e.from === chosen.from && e.to === chosen.to);
      }
      const [next] = this.queue.splice(index, 1);
      if (next && !drop()) next.to.deliver(next.data);
    }
  }
}

export class MemoryTransport implements Transport {
  private readonly handlers = new Set<(message: SyncMessage) => void>();

  constructor(private readonly bus: MemoryBus) {}

  post(message: SyncMessage): void {
    this.bus.send(this, message);
  }

  subscribe(handler: (message: SyncMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close(): void {
    this.bus.disconnect(this);
  }

  /** Raw data goes through the same validation as real BroadcastChannel messages. */
  deliver(data: unknown): void {
    const message = parseMessage(data);
    if (message) for (const handler of this.handlers) handler(message);
  }
}

/** Small seeded PRNG so randomized tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TestTabOptions {
  id: string;
  bus: MemoryBus;
  storage: Persistence;
  now?: () => number;
  preciseNow?: () => number;
  random?: () => number;
}

let drillCounter = 0;

export function openTab({
  id,
  bus,
  storage,
  now = () => 1_000,
  preciseNow = () => 0,
  random = Math.random,
}: TestTabOptions) {
  const transport = bus.connect();
  const store = new SettingsStore(id, storage, defaultDoc(false), now);
  const sync = new TabSync({
    store,
    transport,
    now,
    random,
    preciseNow,
    createId: () => `drill-${++drillCounter}`,
    heartbeatMs: 0,
  });
  sync.start();
  return { sync, transport };
}
