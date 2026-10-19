import { isTabId, parseFields } from './schema';
import { SETTING_KEYS, type SettingKey, type SettingsDoc } from './types';

export const CHANNEL_NAME = 'settings-sync';

export interface EditInfo {
  key: SettingKey;
  /** Set when the edit was made as part of a conflict drill. */
  drillId?: string;
}

export type SyncMessage =
  /** A tab just opened (or came back from the back/forward cache). Carries its state. */
  | { kind: 'hello'; from: string; doc: Partial<SettingsDoc> }
  /** Full state of the sender. `edit` is present when it was caused by a user edit. */
  | { kind: 'state'; from: string; doc: Partial<SettingsDoc>; sentAt: number; edit?: EditInfo }
  /** "This is my state's fingerprint": lets every tab show whether the others agree. */
  | { kind: 'presence'; from: string; digest: string }
  | { kind: 'bye'; from: string }
  | { kind: 'drill'; from: string; drillId: string };

export interface Transport {
  post(message: SyncMessage): void;
  subscribe(handler: (message: SyncMessage) => void): () => void;
  close(): void;
}

/** Messages come from other tabs, possibly running an older build, so validate everything. */
export function parseMessage(data: unknown): SyncMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (!isTabId(m.from)) return null;
  const from = m.from;

  switch (m.kind) {
    case 'hello':
      return { kind: 'hello', from, doc: parseFields(m.doc) };
    case 'state': {
      if (typeof m.sentAt !== 'number' || !Number.isFinite(m.sentAt)) return null;
      const edit = parseEdit(m.edit);
      const message: SyncMessage = { kind: 'state', from, doc: parseFields(m.doc), sentAt: m.sentAt };
      return edit ? { ...message, edit } : message;
    }
    case 'presence':
      return typeof m.digest === 'string' && /^[0-9a-f]{8}$/.test(m.digest)
        ? { kind: 'presence', from, digest: m.digest }
        : null;
    case 'bye':
      return { kind: 'bye', from };
    case 'drill':
      return isTabId(m.drillId) ? { kind: 'drill', from, drillId: m.drillId } : null;
    default:
      return null;
  }
}

function parseEdit(raw: unknown): EditInfo | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { key, drillId } = raw as Record<string, unknown>;
  if (!SETTING_KEYS.includes(key as SettingKey)) return undefined;
  const edit: EditInfo = { key: key as SettingKey };
  if (isTabId(drillId)) edit.drillId = drillId;
  return edit;
}

/**
 * BroadcastChannel hands a structured clone of each message to every other same-origin tab,
 * without going through storage, which keeps cross-tab delivery to around a millisecond.
 */
export class BroadcastTransport implements Transport {
  private readonly channel: BroadcastChannel;
  private closed = false;

  constructor(name: string = CHANNEL_NAME) {
    this.channel = new BroadcastChannel(name);
  }

  post(message: SyncMessage): void {
    if (!this.closed) this.channel.postMessage(message);
  }

  subscribe(handler: (message: SyncMessage) => void): () => void {
    const listener = (event: MessageEvent) => {
      const message = parseMessage(event.data);
      if (message) handler(message);
    };
    this.channel.addEventListener('message', listener);
    return () => this.channel.removeEventListener('message', listener);
  }

  close(): void {
    this.closed = true;
    this.channel.close();
  }
}

/**
 * Used when BroadcastChannel is unavailable. Tabs still converge through the `storage` event;
 * they just lose presence and latency data.
 */
export class NullTransport implements Transport {
  post(): void {}
  subscribe(): () => void {
    return () => {};
  }
  close(): void {}
}
