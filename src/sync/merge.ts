import { compareStamps } from './clock';
import {
  SETTING_KEYS,
  type FieldRecord,
  type Mutable,
  type SettingKey,
  type Settings,
  type SettingsDoc,
} from './types';

/**
 * Total order over field records. Stamps decide; identical stamps can only happen for
 * never-written defaults, and then the value itself decides so every tab still agrees.
 */
export function compareRecords(a: FieldRecord<unknown>, b: FieldRecord<unknown>): number {
  return compareStamps(a.stamp, b.stamp) || compareValues(a.value, b.value);
}

function compareValues(a: unknown, b: unknown): number {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export interface MergeResult {
  doc: SettingsDoc;
  /** Keys whose record was replaced by the incoming one. */
  changed: SettingKey[];
}

/**
 * Per-field last-writer-wins merge. Each field independently keeps the record with the
 * greater stamp, which makes the merge commutative, associative and idempotent: tabs can
 * receive updates in any order, any number of times, and still end up identical.
 */
export function mergeDocs(base: SettingsDoc, incoming: Partial<SettingsDoc>): MergeResult {
  const out: Mutable<SettingsDoc> = { ...base };
  const changed: SettingKey[] = [];
  for (const key of SETTING_KEYS) {
    if (takeIfNewer(out, incoming, key)) changed.push(key);
  }
  return { doc: changed.length > 0 ? out : base, changed };
}

function takeIfNewer<K extends SettingKey>(
  out: Mutable<SettingsDoc>,
  incoming: Partial<SettingsDoc>,
  key: K,
): boolean {
  const theirs = incoming[key];
  if (theirs === undefined || compareRecords(theirs, out[key]) <= 0) return false;
  out[key] = theirs;
  return true;
}

/** True when `other` is missing a write that `doc` has, i.e. `other` needs to catch up. */
export function isBehind(other: Partial<SettingsDoc>, doc: SettingsDoc): boolean {
  return SETTING_KEYS.some((key) => {
    const theirs = other[key];
    if (theirs === undefined) return doc[key].stamp.t > 0;
    return compareRecords(doc[key], theirs) > 0;
  });
}

export function withField<K extends SettingKey>(
  doc: SettingsDoc,
  key: K,
  record: FieldRecord<Settings[K]>,
): SettingsDoc {
  const out: Mutable<SettingsDoc> = { ...doc };
  // TypeScript cannot match a generic key of a mapped type on assignment; the signature
  // above already ties `record` to `key`.
  out[key] = record as SettingsDoc[K];
  return out;
}
