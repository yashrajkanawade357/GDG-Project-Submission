import { STORAGE_KEY } from './schema';

export interface Persistence {
  read(): string | null;
  /** Returns false when storage is unavailable or full; the tab then keeps working in memory. */
  write(raw: string): boolean;
}

export function localStoragePersistence(key: string = STORAGE_KEY): Persistence {
  const storage = getLocalStorage();
  return {
    read() {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(raw) {
      if (!storage) return false;
      try {
        // Identical writes would fire a pointless `storage` event in every other tab.
        if (storage.getItem(key) !== raw) storage.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function getLocalStorage(): Storage | null {
  try {
    // Throws (rather than returning null) when the user has blocked site data.
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
