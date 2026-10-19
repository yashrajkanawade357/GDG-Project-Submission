export const LANGUAGES = ['en', 'hi', 'es', 'fr', 'de', 'ja'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Settings {
  darkMode: boolean;
  language: Language;
  fontSize: number;
}

export type SettingKey = keyof Settings;

export const SETTING_KEYS: readonly SettingKey[] = ['darkMode', 'language', 'fontSize'];

/**
 * Version attached to every write.
 *
 * `t` is a hybrid timestamp: wall-clock milliseconds, nudged forward when needed so a tab's
 * stamps never go backwards and always sort after every stamp that tab has already seen.
 * `tab` is the id of the writing tab; it breaks ties between equal timestamps.
 */
export interface Stamp {
  readonly t: number;
  readonly tab: string;
}

export interface FieldRecord<V> {
  readonly value: V;
  readonly stamp: Stamp;
}

/** The replicated state: every setting carries its own value and version. */
export type SettingsDoc = { readonly [K in SettingKey]: FieldRecord<Settings[K]> };

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
