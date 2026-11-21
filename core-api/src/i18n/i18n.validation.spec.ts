import { I18nModule, I18nService, I18nValidationPipe } from 'nestjs-i18n';
import { formatI18nErrors } from 'nestjs-i18n/dist/utils';
import * as path from 'path';
import { DeleteNotificationByRefDto } from '@/modules/notifications/dto/delete-notification-by-ref.dto';
import { icuFormatter } from '@/common/utils/icu-formatter.util';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { ArgumentMetadata } from '@nestjs/common';

describe('I18nValidationPipe (EN)', () => {
  let module: TestingModule;
  let pipe: I18nValidationPipe;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'en',
          formatter: icuFormatter,
          loaderOptions: { path: path.join(__dirname, '/') },
        }),
      ],
    }).compile();
    pipe = new I18nValidationPipe({ whitelist: true, transform: true });
  });

  afterAll(async () => {
    await module.close();
  });

  it('tags failing decorators with the validation namespace key', async () => {
    const dto = Object.assign(new DeleteNotificationByRefDto(), {
      ref: '',
      refId: '1234',
    });
    const meta: ArgumentMetadata = {
      type: 'body',
      metatype: DeleteNotificationByRefDto,
    };

    const err = await (pipe.transform(dto, meta) as Promise<unknown>).catch(
      (e) => e as { errors: { constraints: Record<string, string> }[] },
    );
    const raw = err.errors[0].constraints['isNotEmpty'];
    expect(raw.startsWith('validation.NOT_EMPTY|')).toBe(true);

    const i18n = module.get(I18nService);
    const [formatted] = formatI18nErrors(
      [
        {
          property: 'ref',
          value: '',
          constraints: { isNotEmpty: raw },
        },
      ],
      i18n,
      { lang: 'en' },
    );
    expect(formatted.constraints['isNotEmpty']).toBe(
      'ref should not be empty',
    );
  });
});
