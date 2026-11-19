import * as fs from 'fs';
import * as path from 'path';
import { I18nContext } from 'nestjs-i18n';
import { IntlMessageFormat } from 'intl-messageformat';
import { icuFormatter } from '@/common/utils/icu-formatter.util';

const I18N_DIR = __dirname;

// Console picks one of these by Intl.PluralRules (see console i18n-dictionary.ts)
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;

function readNamespaces(lang: string): Record<string, Record<string, string>> {
  const dir = path.join(I18N_DIR, lang);
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [
        f.replace(/\.json$/, ''),
        JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<
          string,
          string
        >,
      ]),
  );
}

/** Plural variants collapse to one base key that must carry `.other`. */
function baseKeys(ns: Record<string, string>): string[] {
  return [...new Set(Object.keys(ns).map((k) => k.replace(PLURAL_SUFFIX, '')))]
    .sort();
}

const LANGS = fs
  .readdirSync(I18N_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe('i18n layout (EN-first)', () => {
  it('ships parseable EN namespaces with no empty keys', () => {
    const enDir = path.join(I18N_DIR, 'en');
    const files = fs.readdirSync(enDir).filter((f) => f.endsWith('.json'));
    expect(files).toContain('notification.json');
    for (const file of files) {
      const json = JSON.parse(
        fs.readFileSync(path.join(enDir, file), 'utf8'),
      ) as Record<string, unknown>;
      for (const [key, value] of Object.entries(json)) {
        expect(key.trim().length).toBeGreaterThan(0);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it.each(LANGS.filter((l) => l !== 'en'))(
    '%s has every EN key, nothing extra, ICU parses',
    (lang) => {
      const en = readNamespaces('en');
      const tr = readNamespaces(lang);
      expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
      for (const ns of Object.keys(en)) {
        expect(baseKeys(tr[ns])).toEqual(baseKeys(en[ns]));
        for (const key of Object.keys(en[ns]).filter((k) =>
          PLURAL_SUFFIX.test(k),
        )) {
          expect(tr[ns][key.replace(PLURAL_SUFFIX, '.other')]).toBeDefined();
        }
        for (const [key, value] of Object.entries(tr[ns])) {
          expect(value.trim().length).toBeGreaterThan(0);
          // Same gate as icuFormatter: only plural/select go through ICU
          if (/,\s*(plural|select|selectordinal)\s*,/.test(value)) {
            expect(() => new IntlMessageFormat(value, lang)).not.toThrow();
          }
        }
      }
    },
  );

  it('interpolates dotted args such as validation {constraints.0}', () => {
    expect(
      icuFormatter('{property} min {constraints.0}', {
        property: 'name',
        constraints: [3],
      }),
    ).toBe('name min 3');
  });

  it('formats Russian plurals with the request locale', () => {
    const spy = jest
      .spyOn(I18nContext, 'current')
      .mockReturnValue({ lang: 'ru' } as never);
    try {
      const tpl = readNamespaces('ru').notification['NEW_URL_FOUND'];
      expect(icuFormatter(tpl, { count: 5, targetValue: 'a.com' })).toBe(
        'Найдено 5 новых URL на a.com',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('configures type-safe keys output in AppModule', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'app.module.ts'),
      'utf8',
    );
    expect(source).toContain('typesOutputPath');
    expect(source).toContain('i18n.generated.ts');
  });

  it('formats ICU plural with the request locale (vi has no singular)', () => {
    const spy = jest
      .spyOn(I18nContext, 'current')
      .mockReturnValue({ lang: 'vi' } as never);
    try {
      const msg = icuFormatter(
        '{count, plural, one {# apple} other {# apples}}',
        { count: 1 },
      );
      expect(msg).toBe('1 apples');
    } finally {
      spy.mockRestore();
    }
  });
});
