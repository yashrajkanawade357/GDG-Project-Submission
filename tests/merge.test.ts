import { describe, expect, it } from 'vitest';
import { isBehind, mergeDocs } from '../src/sync/merge';
import { FONT_SIZE, defaultDoc, serializeDoc } from '../src/sync/schema';
import { LANGUAGES, type SettingsDoc } from '../src/sync/types';
import { seededRandom } from './helpers';

function doc(overrides: Partial<SettingsDoc>): SettingsDoc {
  return { ...defaultDoc(false), ...overrides };
}

describe('mergeDocs', () => {
  it('keeps the newer record for each field independently', () => {
    const a = doc({
      darkMode: { value: true, stamp: { t: 10, tab: 'a' } },
      fontSize: { value: 14, stamp: { t: 5, tab: 'a' } },
    });
    const b = doc({
      darkMode: { value: false, stamp: { t: 8, tab: 'b' } },
      fontSize: { value: 20, stamp: { t: 9, tab: 'b' } },
    });

    const { doc: merged, changed } = mergeDocs(a, b);

    expect(merged.darkMode.value).toBe(true);
    expect(merged.fontSize.value).toBe(20);
    expect(changed).toEqual(['fontSize']);
  });

  it('settles identical timestamps by tab id', () => {
    const fromA = doc({ fontSize: { value: 13, stamp: { t: 42, tab: 'tab-a' } } });
    const fromB = doc({ fontSize: { value: 22, stamp: { t: 42, tab: 'tab-b' } } });

    expect(mergeDocs(fromA, fromB).doc.fontSize.value).toBe(22);
    expect(mergeDocs(fromB, fromA).doc.fontSize.value).toBe(22);
  });

  it('settles never-written defaults that differ (e.g. different system themes) by value', () => {
    const light = defaultDoc(false);
    const dark = defaultDoc(true);
    expect(mergeDocs(light, dark).doc.darkMode.value).toBe(mergeDocs(dark, light).doc.darkMode.value);
  });

  it('returns the same object when nothing changed', () => {
    const a = doc({ language: { value: 'fr', stamp: { t: 3, tab: 'a' } } });
    const result = mergeDocs(a, a);
    expect(result.doc).toBe(a);
    expect(result.changed).toEqual([]);
  });

  it('ignores missing fields in a partial update', () => {
    const a = doc({ language: { value: 'de', stamp: { t: 3, tab: 'a' } } });
    expect(mergeDocs(a, {}).doc).toBe(a);
  });

  describe('is a proper merge (so delivery order and duplicates do not matter)', () => {
    const random = seededRandom(7);
    const tabs = ['a', 'b', 'c'];
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const randomDoc = (): SettingsDoc => ({
      darkMode: { value: random() < 0.5, stamp: { t: Math.floor(random() * 5), tab: pick(tabs) } },
      language: { value: pick(LANGUAGES), stamp: { t: Math.floor(random() * 5), tab: pick(tabs) } },
      fontSize: {
        value: FONT_SIZE.min + Math.floor(random() * 13),
        stamp: { t: Math.floor(random() * 5), tab: pick(tabs) },
      },
    });
    const merge = (x: SettingsDoc, y: SettingsDoc) => mergeDocs(x, y).doc;
    const same = (x: SettingsDoc, y: SettingsDoc) => expect(serializeDoc(x)).toBe(serializeDoc(y));
    const samples = Array.from({ length: 300 }, () => [randomDoc(), randomDoc(), randomDoc()] as const);

    it('commutative: merge(a, b) = merge(b, a)', () => {
      for (const [a, b] of samples) same(merge(a, b), merge(b, a));
    });

    it('associative: merge(merge(a, b), c) = merge(a, merge(b, c))', () => {
      for (const [a, b, c] of samples) same(merge(merge(a, b), c), merge(a, merge(b, c)));
    });

    it('idempotent: merge(a, a) = a, and re-applying an update changes nothing', () => {
      for (const [a, b] of samples) {
        same(merge(a, a), a);
        same(merge(merge(a, b), b), merge(a, b));
      }
    });
  });
});

describe('isBehind', () => {
  const ours = doc({ fontSize: { value: 18, stamp: { t: 9, tab: 'a' } } });

  it('detects a copy that is missing one of our writes', () => {
    expect(isBehind(defaultDoc(false), ours)).toBe(true);
    expect(isBehind({}, ours)).toBe(true);
  });

  it('is false for an equal or newer copy', () => {
    expect(isBehind(ours, ours)).toBe(false);
    const newer = doc({ fontSize: { value: 20, stamp: { t: 10, tab: 'b' } } });
    expect(isBehind(newer, ours)).toBe(false);
  });

  it('does not count unwritten defaults as missing', () => {
    expect(isBehind({}, defaultDoc(false))).toBe(false);
  });
});
