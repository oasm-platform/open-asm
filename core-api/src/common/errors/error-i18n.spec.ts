import type { I18nContext } from 'nestjs-i18n';
import { errorMessageMatchers, translateErrorMessage } from './error-i18n';

const EN = {
  projectNotFound: 'Project "{id}" not found',
  workspaceNotFound: 'Workspace not found',
  invalidConfigTool: 'Invalid config for tool "{toolName}": {errors}',
};

const VI: Record<string, string> = {
  projectNotFound: 'Không tìm thấy dự án "{id}"',
  workspaceNotFound: 'Không tìm thấy workspace',
  invalidConfigTool: 'Cấu hình không hợp lệ cho "{toolName}": {errors}',
};

function context(lang: string): I18nContext {
  return {
    lang,
    service: { getTranslations: () => ({ en: { errors: EN } }) },
    t: (key: string, options?: { args?: Record<string, string> }) =>
      VI[key.replace('errors.', '')].replace(
        /\{(\w+)\}/g,
        (_, name: string) => options?.args?.[name] ?? '',
      ),
  } as unknown as I18nContext;
}

describe('translateErrorMessage', () => {
  it('translates an exact message', () => {
    expect(translateErrorMessage('Workspace not found', context('vi'))).toBe(
      'Không tìm thấy workspace',
    );
  });

  it('carries interpolated parts into the translation', () => {
    expect(
      translateErrorMessage(
        'Invalid config for tool "nuclei": a: b; "c"',
        context('vi'),
      ),
    ).toBe('Cấu hình không hợp lệ cho "nuclei": a: b; "c"');
    expect(translateErrorMessage('Project "p-1" not found', context('vi'))).toBe(
      'Không tìm thấy dự án "p-1"',
    );
  });

  it('leaves unknown messages, English and missing contexts alone', () => {
    expect(translateErrorMessage('Something else', context('vi'))).toBe(
      'Something else',
    );
    expect(translateErrorMessage('Workspace not found', context('en'))).toBe(
      'Workspace not found',
    );
    expect(translateErrorMessage('Workspace not found', undefined)).toBe(
      'Workspace not found',
    );
  });

  it('escapes regex characters in the literal text', () => {
    const { templates } = errorMessageMatchers({ k: 'Size (max {n}) [MB]?' });
    expect(templates[0].pattern.test('Size (max 5) [MB]?')).toBe(true);
    expect(templates[0].pattern.test('Size max 5 MB')).toBe(false);
  });
});
