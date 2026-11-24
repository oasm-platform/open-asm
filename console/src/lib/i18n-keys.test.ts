import { describe, expect, it } from 'vitest';

// Every literal t('ns.key') in the console must exist in the EN dictionary
// (core-api/src/i18n/en/<ns>.json); a typo would otherwise render the raw key.
const sources = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/services/apis/gen/**'],
  { eager: true, query: '?raw', import: 'default' },
);
const en = import.meta.glob<Record<string, string>>(
  '../../../core-api/src/i18n/en/*.json',
  { eager: true, import: 'default' },
);
const dict: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(en).map(([f, table]) => [f.replace(/^.*\/(.+)\.json$/, '$1'), table]),
);
const PLURAL = /\.(zero|one|two|few|many|other)$/;

function exists(key: string) {
  const dot = key.indexOf('.');
  const table = dict[key.slice(0, dot)];
  const name = key.slice(dot + 1);
  return !!table && (name in table || `${name}.other` in table);
}

describe('console i18n keys', () => {
  it('every literal t() key exists in EN', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(dict.ui).toBeDefined();
    const missing: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/\bt\(\s*['"`]([a-zA-Z][\w-]*\.[\w.-]+)['"`]/g)) {
        if (!exists(m[1]) && !PLURAL.test(m[1])) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
