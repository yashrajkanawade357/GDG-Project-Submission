import { localStoragePersistence } from './persistence';
import { STORAGE_KEY, defaultDoc } from './schema';
import { SettingsStore } from './store';
import { TabSync } from './tabSync';
import { BroadcastTransport, NullTransport, type Transport } from './transport';

export { TabSync, drillWinner } from './tabSync';
export type { Drill, DrillProposal, Peer, SyncEvent } from './tabSync';

/** Wires a TabSync to the real browser: localStorage, BroadcastChannel and page lifecycle events. */
export function createBrowserTabSync(): TabSync {
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const store = new SettingsStore(createId(), localStoragePersistence(), defaultDoc(prefersDark));
  const transport: Transport =
    typeof BroadcastChannel === 'function' ? new BroadcastTransport() : new NullTransport();
  const sync = new TabSync({ store, transport, createId });

  // Second delivery path: every localStorage write reaches the other tabs as a `storage` event.
  // It is slower than BroadcastChannel, but merging is idempotent, so receiving both is harmless.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) sync.refreshFromStorage();
  });

  // Catch up on anything missed while the tab was hidden, frozen or in the back/forward cache.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync.refreshFromStorage();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    sync.refreshFromStorage();
    sync.announce();
  });
  window.addEventListener('pagehide', () => sync.leave());

  sync.start();
  return sync;
}

export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID only exists in secure contexts (https or localhost).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
