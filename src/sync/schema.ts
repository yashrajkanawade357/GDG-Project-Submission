import {
  LANGUAGES,
  SETTING_KEYS,
  type FieldRecord,
  type Language,
  type Mutable,
  type SettingKey,
  type Settings,
  type SettingsDoc,
  type Stamp,
} from './types';

export const STORAGE_KEY = 'settings-sync:v1';
export const STORAGE_VERSION = 1;
export const FONT_SIZE = { min: 12, max: 24, default: 16 } as const;

/** Stamp for values nobody has written yet. Any real write sorts after it. */
export const ZERO_STAMP: Stamp = { t: 0, tab: '' };

const validators: { [K in SettingKey]: (value: unknown) => value is Settings[K] } = {
  darkMode: (v): v is boolean => typeof v === 'boolean',
  language: (v): v is Language => typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v),
  fontSize: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= FONT_SIZE.min && v <= FONT_SIZE.max,
};

export function isValidValue<K extends SettingKey>(key: K, value: unknown): value is Settings[K] {
  return validators[key](value);
}

const TAB_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isTabId(value: unknown): value is string {
  return typeof value === 'string' && TAB_ID.test(value);
}

export function isStamp(value: unknown): value is Stamp {
  if (typeof value !== 'object' || value === null) return false;
  const { t, tab } = value as Record<string, unknown>;
  return (
    typeof t === 'number' && Number.isSafeInteger(t) && t >= 0 && (tab === '' || isTabId(tab))
  );
}

export function defaultDoc(prefersDark = false): SettingsDoc {
  return {
    darkMode: { value: prefersDark, stamp: ZERO_STAMP },
    language: { value: 'en', stamp: ZERO_STAMP },
    fontSize: { value: FONT_SIZE.default, stamp: ZERO_STAMP },
  };
}

export function toSettings(doc: SettingsDoc): Settings {
  return {
    darkMode: doc.darkMode.value,
    language: doc.language.value,
    fontSize: doc.fontSize.value,
  };
}

/**
 * Validates untrusted fields (from storage or another tab) one by one. Anything malformed is
 * dropped rather than rejecting the whole document, so one bad field cannot block the others.
 */
export function parseFields(raw: unknown): Partial<SettingsDoc> {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const out: Partial<Mutable<SettingsDoc>> = {};
  for (const key of SETTING_KEYS) readField(out, source, key);
  return out;
}

function readField<K extends SettingKey>(
  out: Partial<Mutable<SettingsDoc>>,
  source: Record<string, unknown>,
  key: K,
): void {
  const record = source[key];
  if (typeof record !== 'object' || record === null) return;
  const { value, stamp } = record as Record<string, unknown>;
  if (isValidValue(key, value) && isStamp(stamp)) {
    const parsed: FieldRecord<Settings[K]> = { value, stamp: { t: stamp.t, tab: stamp.tab } };
    out[key] = parsed as SettingsDoc[K];
  }
}

export function isCompleteDoc(doc: Partial<SettingsDoc>): doc is SettingsDoc {
  return SETTING_KEYS.every((key) => doc[key] !== undefined);
}

/** Stable serialization: fixed key order, so equal documents always produce equal strings. */
export function serializeDoc(doc: SettingsDoc): string {
  const fields: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const { value, stamp } = doc[key];
    fields[key] = { value, stamp: { t: stamp.t, tab: stamp.tab } };
  }
  return JSON.stringify({ v: STORAGE_VERSION, fields });
}

export function parseStored(raw: string | null): Partial<SettingsDoc> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return {};
    const { v, fields } = data as Record<string, unknown>;
    return v === STORAGE_VERSION ? parseFields(fields) : {};
  } catch {
    return {};
  }
}

/** Short fingerprint of a document (FNV-1a), used to show at a glance whether two tabs agree. */
export function digestDoc(doc: SettingsDoc): string {
  const text = serializeDoc(doc);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
