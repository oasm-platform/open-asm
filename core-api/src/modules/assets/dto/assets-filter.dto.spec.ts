import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAssetsQueryDto } from './assets.dto';
import { GetTlsQueryDto } from './tls.dto';

const errorsFor = async (
  cls: typeof GetAssetsQueryDto | typeof GetTlsQueryDto,
  filter: string,
) => validate(plainToInstance(cls, { filter }) as object);

describe('filter query param', () => {
  const valid = JSON.stringify({
    logic: 'and',
    items: [{ field: 'host', op: 'contains', value: 'api' }],
  });

  it.each([GetAssetsQueryDto, GetTlsQueryDto])(
    '%p parses a valid JSON filter',
    async (cls) => {
      const dto = plainToInstance(cls, { filter: valid });
      expect(dto.filter).toEqual(JSON.parse(valid));
      expect(await validate(dto as object)).toHaveLength(0);
    },
  );

  it.each([
    ['malformed JSON', '{bad'],
    [
      'unknown field',
      JSON.stringify({
        logic: 'and',
        items: [{ field: 'x', op: 'eq', value: 'a' }],
      }),
    ],
  ])('rejects %s', async (_, filter) => {
    const errors = await errorsFor(GetAssetsQueryDto, filter);
    expect(errors.map((e) => e.property)).toContain('filter');
  });
});
