import { describe, expect, it } from 'vitest';
import {
  defaultDoc,
  digestDoc,
  isCompleteDoc,
  parseStored,
  serializeDoc,
} from '../src/sync/schema';
import { withField } from '../src/sync/merge';
import { parseMessage } from '../src/sync/transport';

const stamp = { t: 1_700_000_000_000, tab: 'tab-1' };

describe('stored document parsing', () => {
  it('round-trips through serialization', () => {
    const doc = withField(defaultDoc(false), 'language', { value: 'ja', stamp });
    expect(parseStored(serializeDoc(doc))).toEqual(doc);
  });

  it('treats missing, corrupted or foreign data as empty', () => {
    expect(parseStored(null)).toEqual({});
    expect(parseStored('{not json')).toEqual({});
    expect(parseStored('"text"')).toEqual({});
    expect(parseStored(JSON.stringify({ v: 99, fields: {} }))).toEqual({});
  });

  it('drops invalid fields one by one and keeps the valid ones', () => {
    const raw = JSON.stringify({
      v: 1,
      fields: {
        darkMode: { value: 'yes', stamp },
        language: { value: 'hi', stamp },
        fontSize: { value: 99, stamp },
      },
    });
    expect(parseStored(raw)).toEqual({ language: { value: 'hi', stamp } });
  });

  it('rejects bad stamps', () => {
    const fields = (s: unknown) => JSON.stringify({ v: 1, fields: { darkMode: { value: true, stamp: s } } });
    expect(parseStored(fields({ t: -1, tab: 'a' }))).toEqual({});
    expect(parseStored(fields({ t: 1.5, tab: 'a' }))).toEqual({});
    expect(parseStored(fields({ t: 1, tab: '<script>' }))).toEqual({});
    expect(parseStored(fields(null))).toEqual({});
  });

  it('rejects text sizes that are fractional or out of range', () => {
    const size = (value: unknown) => JSON.stringify({ v: 1, fields: { fontSize: { value, stamp } } });
    expect(parseStored(size(16.5))).toEqual({});
    expect(parseStored(size(11))).toEqual({});
    expect(parseStored(size(25))).toEqual({});
    expect(parseStored(size(12))).toEqual({ fontSize: { value: 12, stamp } });
    expect(parseStored(size(24))).toEqual({ fontSize: { value: 24, stamp } });
  });
});

describe('digestDoc', () => {
  it('is stable for equal documents and changes when anything changes', () => {
    const a = defaultDoc(false);
    expect(digestDoc(a)).toBe(digestDoc(defaultDoc(false)));
    expect(digestDoc(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(digestDoc(withField(a, 'fontSize', { value: 17, stamp }))).not.toBe(digestDoc(a));
  });
});

describe('isCompleteDoc', () => {
  it('requires every field', () => {
    expect(isCompleteDoc(defaultDoc(false))).toBe(true);
    expect(isCompleteDoc({ darkMode: { value: true, stamp } })).toBe(false);
  });
});

describe('parseMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parseMessage({ kind: 'bye', from: 'tab-1' })).toEqual({ kind: 'bye', from: 'tab-1' });
    expect(parseMessage({ kind: 'presence', from: 'tab-1', digest: '0a1b2c3d' })).toEqual({
      kind: 'presence',
      from: 'tab-1',
      digest: '0a1b2c3d',
    });
    const state = parseMessage({
      kind: 'state',
      from: 'tab-1',
      sentAt: 5,
      doc: defaultDoc(true),
      edit: { key: 'darkMode' },
    });
    expect(state).toEqual({ kind: 'state', from: 'tab-1', sentAt: 5, doc: defaultDoc(true), edit: { key: 'darkMode' } });
  });

  it('rejects anything malformed', () => {
    for (const bad of [
      null,
      'hello',
      { kind: 'bye' },
      { kind: 'bye', from: '' },
      { kind: 'unknown', from: 'tab-1' },
      { kind: 'state', from: 'tab-1', doc: {} },
      { kind: 'presence', from: 'tab-1', digest: 'nope' },
      { kind: 'drill', from: 'tab-1' },
    ]) {
      expect(parseMessage(bad)).toBeNull();
    }
  });

  it('drops an unknown edit key instead of trusting it', () => {
    const message = parseMessage({ kind: 'state', from: 'a', sentAt: 1, doc: {}, edit: { key: 'admin' } });
    expect(message).toEqual({ kind: 'state', from: 'a', sentAt: 1, doc: {} });
  });
});
