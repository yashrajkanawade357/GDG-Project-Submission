import { HybridClock } from './clock';
import { isBehind, mergeDocs, withField } from './merge';
import type { Persistence } from './persistence';
import { digestDoc, isValidValue, parseStored, serializeDoc, toSettings } from './schema';
import { SETTING_KEYS, type SettingKey, type Settings, type SettingsDoc } from './types';

/**
 * One tab's replica of the settings. It stamps local edits, merges state from other tabs and
 * keeps localStorage current. It does not know how state travels between tabs.
 */
export class SettingsStore {
  private current: SettingsDoc;
  private readonly clock: HybridClock;

  constructor(
    readonly tabId: string,
    private readonly persistence: Persistence,
    defaults: SettingsDoc,
    now?: () => number,
  ) {
    this.clock = new HybridClock(tabId, now);
    this.current = defaults;
    this.merge(parseStored(persistence.read()));
  }

  get doc(): SettingsDoc {
    return this.current;
  }

  get settings(): Settings {
    return toSettings(this.current);
  }

  get digest(): string {
    return digestDoc(this.current);
  }

  /**
   * Applies a local edit in memory. Returns false for invalid values and for edits that change
   * nothing. Call save() afterwards; the caller decides the order of broadcast and save.
   */
  set<K extends SettingKey>(key: K, value: Settings[K]): boolean {
    if (!isValidValue(key, value) || Object.is(this.current[key].value, value)) return false;
    this.current = withField(this.current, key, { value, stamp: this.clock.tick() });
    return true;
  }

  /** Merges state from another tab. Returns the keys that changed here. */
  merge(incoming: Partial<SettingsDoc>): SettingKey[] {
    for (const key of SETTING_KEYS) {
      const record = incoming[key];
      if (record) this.clock.observe(record.stamp);
    }
    const { doc, changed } = mergeDocs(this.current, incoming);
    this.current = doc;
    return changed;
  }

  /**
   * Reconciles with localStorage: adopts anything newer that another tab stored, and rewrites
   * the stored copy when it is missing a write we hold. Two tabs saving at the same instant
   * can overwrite each other, so whichever tab notices the regression repairs it.
   */
  syncWithStorage(): SettingKey[] {
    const stored = parseStored(this.persistence.read());
    const changed = this.merge(stored);
    if (isBehind(stored, this.current)) this.save();
    return changed;
  }

  save(): void {
    this.persistence.write(serializeDoc(this.current));
  }
}
