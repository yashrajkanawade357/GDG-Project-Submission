import { afterEach, describe, expect, it } from 'vitest';
import indexHtml from '../app/index.html?raw';
import landingHtml from '../index.html?raw';
import { withField } from '../src/sync/merge';
import { FONT_SIZE, STORAGE_KEY, defaultDoc, serializeDoc } from '../src/sync/schema';
import { LANGUAGES, type Language } from '../src/sync/types';

/** The inline script in <head> that runs before first paint. */
function inlineScript(html: string): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error('page has no inline boot script');
  return match[1];
}

const bootScript = inlineScript(indexHtml);

function boot(stored: string | null): { theme: string | null; fontSize: string; lang: string } {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('style');
  root.lang = '';
  if (stored === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, stored);

  new Function(bootScript)();
  return { theme: root.getAttribute('data-theme'), fontSize: root.style.fontSize, lang: root.lang };
}

const stamp = { t: 1_700_000_000_000, tab: 'tab-1' };

afterEach(() => localStorage.clear());

describe('boot script (no flash of the wrong theme)', () => {
  it('applies the saved preferences before the app loads', () => {
    let doc = defaultDoc(false);
    doc = withField(doc, 'darkMode', { value: true, stamp });
    doc = withField(doc, 'fontSize', { value: 20, stamp });
    doc = withField(doc, 'language', { value: 'hi', stamp });

    expect(boot(serializeDoc(doc))).toEqual({ theme: 'dark', fontSize: '20px', lang: 'hi' });
  });

  it('falls back to defaults when nothing is saved', () => {
    expect(boot(null)).toEqual({ theme: 'light', fontSize: '16px', lang: 'en' });
  });

  it('falls back to defaults when storage holds garbage', () => {
    expect(boot('{oops')).toEqual({ theme: 'light', fontSize: '16px', lang: 'en' });
    expect(boot(JSON.stringify({ v: 2, fields: { darkMode: { value: true } } }))).toEqual({
      theme: 'light',
      fontSize: '16px',
      lang: 'en',
    });
  });

  it('ignores individual invalid values', () => {
    const raw = JSON.stringify({
      v: 1,
      fields: {
        darkMode: { value: 'true', stamp },
        fontSize: { value: '20', stamp },
        language: { value: ['en'], stamp },
      },
    });
    expect(boot(raw)).toEqual({ theme: 'light', fontSize: '16px', lang: 'en' });
  });

  it('accepts exactly what the app accepts', () => {
    for (const language of LANGUAGES) {
      const doc = withField(defaultDoc(false), 'language', { value: language as Language, stamp });
      expect(boot(serializeDoc(doc)).lang).toBe(language);
    }
    for (const size of [FONT_SIZE.min, FONT_SIZE.max]) {
      const doc = withField(defaultDoc(false), 'fontSize', { value: size, stamp });
      expect(boot(serializeDoc(doc)).fontSize).toBe(`${size}px`);
    }
    const tooBig = JSON.stringify({ v: 1, fields: { fontSize: { value: FONT_SIZE.max + 1, stamp } } });
    expect(boot(tooBig).fontSize).toBe(`${FONT_SIZE.default}px`);
    expect(indexHtml).toContain(`'${STORAGE_KEY}'`);
  });
});

describe('landing page boot script', () => {
  it('uses the theme saved by the app', () => {
    const dark = withField(defaultDoc(false), 'darkMode', { value: true, stamp });
    localStorage.setItem(STORAGE_KEY, serializeDoc(dark));
    document.documentElement.removeAttribute('data-theme');
    new Function(inlineScript(landingHtml))();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
