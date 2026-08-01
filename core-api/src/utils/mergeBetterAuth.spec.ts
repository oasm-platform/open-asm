import { normalizeSchemaType } from './mergeBetterAuth';

describe('normalizeSchemaType', () => {
  it('converts array-form type ["object","null"] to type + nullable', () => {
    expect(
      normalizeSchemaType({
        type: ['object', 'null'],
        properties: { name: { type: 'string' } },
      }),
    ).toEqual({
      type: 'object',
      nullable: true,
      properties: { name: { type: 'string' } },
    });
  });

  it('converts ["string","null"] to string + nullable', () => {
    expect(normalizeSchemaType({ type: ['string', 'null'] })).toEqual({
      type: 'string',
      nullable: true,
    });
  });

  it('leaves a single-string type untouched', () => {
    const schema = { type: 'object', properties: {} };
    expect(normalizeSchemaType(schema)).toEqual(schema);
  });

  it('normalizes nested schemas recursively', () => {
    expect(
      normalizeSchemaType({
        schema: { type: ['object', 'null'] },
        items: { type: ['array', 'null'], items: { type: 'string' } },
      }),
    ).toEqual({
      schema: { type: 'object', nullable: true },
      items: { type: 'array', nullable: true, items: { type: 'string' } },
    });
  });

  it('leaves non-schema values untouched', () => {
    expect(normalizeSchemaType(['a', 'b'])).toEqual(['a', 'b']);
    expect(normalizeSchemaType('string')).toBe('string');
  });

  it('strips JSON Schema 3.1 keywords that OpenAPI 3.0 rejects (propertyNames)', () => {
    expect(
      normalizeSchemaType({
        type: 'object',
        propertyNames: { type: 'string' },
        properties: {
          data: { type: 'object', propertyNames: { maxLength: 3 } },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: { data: { type: 'object' } },
    });
  });
});
