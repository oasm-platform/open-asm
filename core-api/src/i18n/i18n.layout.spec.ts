import * as fs from 'fs';
import * as path from 'path';
import { I18nContext } from 'nestjs-i18n';
import { icuFormatter } from '@/common/utils/icu-formatter.util';

const I18N_DIR = __dirname;

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
