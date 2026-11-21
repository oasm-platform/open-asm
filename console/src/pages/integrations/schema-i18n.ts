import type { TFunction } from '@/lib/i18n-dictionary';
import { CAPABILITIES_KEYWORD, type CapabilityMeta } from './capabilities';
import type { SchemaOneOfItem } from './index';

/**
 * Integration schemas arrive from the API in English. Their texts have keys
 * under `integrations.schema.*`: an app-specific key wins over the shared
 * one, and a text without a key (a newer backend) keeps the schema's own.
 */
function pick(t: TFunction, keys: string[], fallback?: string) {
  for (const key of keys) {
    const text = t(key);
    if (text !== key) return text;
  }
  return fallback;
}

const humanize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

/** Label of a `ui:form:group` section. */
export const groupLabel = (t: TFunction, group: string) =>
  pick(t, [`integrations.schema.group.${group}`], humanize(group))!;

/** Label of an enum option value, e.g. `assumeRole`. */
export const optionLabel = (t: TFunction, value: string) =>
  pick(t, [`integrations.schema.option.${value}`], humanize(value))!;

/** Label of a capability / category value, e.g. `CLOUD_PROVIDER`. */
export const categoryLabel = (t: TFunction, category: string) =>
  pick(t, [`integrations.schema.category.${category}`], humanize(category))!;

/** Copy of an app schema with its texts in the current language. */
export function localizeSchema(
  t: TFunction,
  schema: SchemaOneOfItem,
): SchemaOneOfItem {
  const app = schema.$id ?? '';
  const text = (path: string, attr: string, fallback?: string) =>
    fallback &&
    pick(
      t,
      [
        `integrations.schema.${app}.${path}.${attr}`,
        `integrations.schema.field.${path}.${attr}`,
      ],
      fallback,
    );

  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([key, raw]) => {
      const prop = raw as { title?: string; description?: string };
      return [
        key,
        {
          ...prop,
          title: text(key, 'title', prop.title),
          description: text(key, 'description', prop.description),
        },
      ];
    }),
  );

  const capabilities = schema[CAPABILITIES_KEYWORD] as
    | Record<string, CapabilityMeta>
    | undefined;

  return {
    ...schema,
    description:
      schema.description &&
      pick(t, [`integrations.schema.${app}.description`], schema.description),
    properties,
    ...(capabilities && {
      [CAPABILITIES_KEYWORD]: Object.fromEntries(
        Object.entries(capabilities).map(([cap, meta]) => [
          cap,
          {
            ...meta,
            title: pick(
              t,
              [`integrations.schema.capability.${cap}.title`],
              meta.title,
            )!,
            description:
              meta.description &&
              pick(
                t,
                [`integrations.schema.${app}.capability.${cap}.description`],
                meta.description,
              ),
          },
        ]),
      ),
    }),
  };
}
