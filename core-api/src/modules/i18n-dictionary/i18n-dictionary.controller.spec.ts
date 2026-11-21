import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { I18nDictionaryController } from './i18n-dictionary.controller';

function buildModule(translations: Record<string, unknown>) {
  return Test.createTestingModule({
    controllers: [I18nDictionaryController],
    providers: [
      {
        provide: I18nService,
        useValue: {
          getTranslations: () => translations,
          getSupportedLanguages: () => Object.keys(translations),
        },
      },
    ],
  }).compile();
}

describe('I18nDictionaryController', () => {
  let controller: I18nDictionaryController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await buildModule({
      en: { notification: { WORKSPACE_CREATED: 'Workspace {name} created' } },
    });
    controller = module.get(I18nDictionaryController);
  });

  afterEach(async () => {
    await module.close();
  });

  it('returns the merged dictionary for a supported language', () => {
    const res = controller.getDictionary('en');
    expect(res.lang).toBe('en');
    expect(res.dictionaries.notification.WORKSPACE_CREATED).toBe(
      'Workspace {name} created',
    );
  });

  it('lists supported languages', () => {
    expect(controller.getLanguages()).toEqual(['en']);
  });

  it('rejects unknown languages and path traversal without touching disk', () => {
    expect(() => controller.getDictionary('xx')).toThrow();
    expect(() => controller.getDictionary('../../etc')).toThrow();
  });
});
