import { LatencyStats } from './latency';
import { compareRecords, isBehind } from './merge';
import { FONT_SIZE, digestDoc, isCompleteDoc } from './schema';
import type { SettingsStore } from './store';
import type { EditInfo, SyncMessage, Transport } from './transport';
import type { FieldRecord, SettingKey, Settings, SettingsDoc, Stamp } from './types';

export type ChangeSource = 'local' | 'remote' | 'storage';

export type SyncEvent =
  | { type: 'settings'; source: ChangeSource; keys: SettingKey[]; from?: string }
  /** A user edit from another tab arrived; `ms` runs from its broadcast to it being applied here. */
  | { type: 'latency'; ms: number; from: string; key: SettingKey }
  | { type: 'peers' }
  | { type: 'drill' };

export interface Peer {
  id: string;
  /** Fingerprint of the peer's settings, or null until it has told us. */
  digest: string | null;
  lastSeen: number;
}

export interface DrillProposal {
  tab: string;
  value: number;
  stamp: Stamp;
}

export interface Drill {
  id: string;
  startedBy: string | null;
  proposals: DrillProposal[];
}

export interface TabSyncOptions {
  store: SettingsStore;
  transport: Transport;
  /** Epoch milliseconds with sub-millisecond precision; only used to measure latency. */
  preciseNow?: () => number;
  now?: () => number;
  random?: () => number;
  createId?: () => string;
  /** How often to re-announce this tab's fingerprint. 0 disables the timer. */
  heartbeatMs?: number;
  /** Forget a tab that has been silent this long (it crashed without saying bye). */
  peerTimeoutMs?: number;
}

/**
 * Connects a tab's SettingsStore to the other tabs: broadcasts local edits, merges remote
 * ones, and keeps the monitoring data (open tabs, latency, conflict drills) the UI shows.
 */
export class TabSync {
  readonly latency = new LatencyStats();

  private readonly store: SettingsStore;
  private readonly transport: Transport;
  private readonly preciseNow: () => number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly createId: () => string;
  private readonly heartbeatMs: number;
  private readonly peerTimeoutMs: number;

  private readonly peers = new Map<string, Peer>();
  private readonly listeners = new Set<(event: SyncEvent) => void>();
  private currentDrill: (Drill & { joined: boolean }) | null = null;
  private unsubscribe: (() => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(options: TabSyncOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.preciseNow = options.preciseNow ?? (() => performance.timeOrigin + performance.now());
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    // Generous, because browsers throttle timers in background tabs to as little as once a minute.
    this.peerTimeoutMs = options.peerTimeoutMs ?? 150_000;
  }

  get tabId(): string {
    return this.store.tabId;
  }

  get settings(): Settings {
    return this.store.settings;
  }

  get doc(): SettingsDoc {
    return this.store.doc;
  }

  get digest(): string {
    return this.store.digest;
  }

  get drill(): Drill | null {
    return this.currentDrill;
  }

  /** Other open tabs, sorted by id so every tab lists them in the same order. */
  get peerList(): Peer[] {
    return [...this.peers.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  get inSyncWithPeers(): boolean {
    const digest = this.digest;
    return this.peerList.every((peer) => peer.digest === digest);
  }

  subscribe(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.transport.subscribe((message) => this.handle(message));
    this.announce();
    if (this.heartbeatMs > 0) {
      this.heartbeat = setInterval(() => this.beat(), this.heartbeatMs);
    }
  }

  /** Introduces this tab, with its state, so others can list it and either side can catch up. */
  announce(): void {
    this.post({ kind: 'hello', from: this.tabId, doc: this.store.doc });
  }

  /** The page is going away (closed, reloaded, or moved into the back/forward cache). */
  leave(): void {
    this.post({ kind: 'bye', from: this.tabId });
  }

  dispose(): void {
    this.leave();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.transport.close();
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): boolean {
    return this.write(key, value);
  }

  /** Something may have changed in localStorage behind our back: a `storage` event, or the tab woke up. */
  refreshFromStorage(): void {
    const keys = this.store.syncWithStorage();
    if (keys.length === 0) return;
    this.emit({ type: 'settings', source: 'storage', keys });
    this.postPresence();
  }

  /** Makes every open tab write a different text size at the same moment. */
  runDrill(): void {
    const drillId = this.createId();
    this.post({ kind: 'drill', from: this.tabId, drillId });
    this.joinDrill(drillId, this.tabId);
  }

  private write<K extends SettingKey>(key: K, value: Settings[K], drillId?: string): boolean {
    // Pick up anything newer first, so this edit's stamp is ordered after it.
    this.refreshFromStorage();
    if (!this.store.set(key, value)) return false;

    const edit: EditInfo = drillId ? { key, drillId } : { key };
    this.post({ kind: 'state', from: this.tabId, doc: this.store.doc, sentAt: this.preciseNow(), edit });
    // Save after broadcasting: the localStorage write also fires `storage` events in the other
    // tabs, and the faster BroadcastChannel message should reach them first.
    this.store.save();
    if (drillId) this.recordProposal(drillId, this.tabId, this.store.doc.fontSize);
    this.emit({ type: 'settings', source: 'local', keys: [key] });
    return true;
  }

  private handle(message: SyncMessage): void {
    if (message.from === this.tabId) return;
    this.touchPeer(message.from);

    switch (message.kind) {
      case 'hello':
        this.applyRemote(message.doc, message.from);
        this.notePeerDoc(message.from, message.doc);
        // Reply with our full state: the newcomer may have read an out-of-date copy from storage.
        this.post({ kind: 'state', from: this.tabId, doc: this.store.doc, sentAt: this.preciseNow() });
        break;
      case 'state':
        this.onState(message);
        break;
      case 'presence':
        this.setPeerDigest(message.from, message.digest);
        break;
      case 'bye':
        if (this.peers.delete(message.from)) this.emit({ type: 'peers' });
        break;
      case 'drill':
        this.joinDrill(message.drillId, message.from);
        break;
    }
  }

  private onState(message: Extract<SyncMessage, { kind: 'state' }>): void {
    const changed = this.applyRemote(message.doc, message.from);

    if (message.edit) {
      // Measured after listeners ran, so it includes re-rendering this page.
      const ms = this.preciseNow() - message.sentAt;
      this.latency.record(ms);
      this.emit({ type: 'latency', ms, from: message.from, key: message.edit.key });

      const proposal = message.doc.fontSize;
      if (message.edit.drillId && proposal?.stamp.tab === message.from) {
        this.recordProposal(message.edit.drillId, message.from, proposal);
      }
    }

    this.notePeerDoc(message.from, message.doc);

    if (isBehind(message.doc, this.store.doc)) {
      // The sender is missing a write we hold: send our state back so it catches up.
      this.post({ kind: 'state', from: this.tabId, doc: this.store.doc, sentAt: this.preciseNow() });
    } else if (message.edit || changed.length > 0) {
      this.postPresence();
    }
  }

  private applyRemote(doc: Partial<SettingsDoc>, from: string): SettingKey[] {
    const keys = this.store.merge(doc);
    if (keys.length > 0) this.emit({ type: 'settings', source: 'remote', keys, from });
    return keys;
  }

  private joinDrill(drillId: string, startedBy: string): void {
    const drill = this.drillFor(drillId);
    drill.startedBy = startedBy;
    if (drill.joined) return;
    drill.joined = true;
    this.write('fontSize', pickOtherSize(this.store.settings.fontSize, this.random), drillId);
    this.emit({ type: 'drill' });
  }

  private recordProposal(drillId: string, tab: string, record: FieldRecord<number>): void {
    const drill = this.drillFor(drillId);
    if (drill.proposals.some((p) => p.tab === tab)) return;
    drill.proposals.push({ tab, value: record.value, stamp: record.stamp });
    this.emit({ type: 'drill' });
  }

  private drillFor(drillId: string): Drill & { joined: boolean } {
    if (this.currentDrill?.id !== drillId) {
      this.currentDrill = { id: drillId, startedBy: null, proposals: [], joined: false };
    }
    return this.currentDrill;
  }

  private touchPeer(id: string): void {
    const peer = this.peers.get(id);
    if (peer) {
      peer.lastSeen = this.now();
      return;
    }
    this.peers.set(id, { id, digest: null, lastSeen: this.now() });
    this.emit({ type: 'peers' });
  }

  private notePeerDoc(id: string, doc: Partial<SettingsDoc>): void {
    if (isCompleteDoc(doc)) this.setPeerDigest(id, digestDoc(doc));
  }

  private setPeerDigest(id: string, digest: string): void {
    const peer = this.peers.get(id);
    if (!peer || peer.digest === digest) return;
    peer.digest = digest;
    this.emit({ type: 'peers' });
  }

  private postPresence(): void {
    this.post({ kind: 'presence', from: this.tabId, digest: this.digest });
  }

  private beat(): void {
    this.postPresence();
    const cutoff = this.now() - this.peerTimeoutMs;
    let pruned = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) pruned = this.peers.delete(id) || pruned;
    }
    if (pruned) this.emit({ type: 'peers' });
  }

  private post(message: SyncMessage): void {
    try {
      this.transport.post(message);
    } catch (error) {
      console.error('Could not broadcast settings change', error);
    }
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

/** The drill winner every tab should agree on: the proposal with the greatest stamp. */
export function drillWinner(drill: Drill): DrillProposal | null {
  let best: DrillProposal | null = null;
  for (const proposal of drill.proposals) {
    if (!best || compareRecords(proposal, best) > 0) best = proposal;
  }
  return best;
}

/** Random text size in range, guaranteed to differ from the current one. */
function pickOtherSize(current: number, random: () => number): number {
  const choices = FONT_SIZE.max - FONT_SIZE.min;
  const size = FONT_SIZE.min + Math.floor(random() * choices);
  return size >= current ? size + 1 : size;
}
