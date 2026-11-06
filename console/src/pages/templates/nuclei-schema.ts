import type { yamlSchema } from 'codemirror-json-schema/yaml';

// Vendored unchanged from projectdiscovery/nuclei v3.11.1 (nuclei-jsonschema.json); refresh on nuclei upgrades.
import raw from './nuclei-jsonschema.json';

/**
 * The editor's validator (json-schema-library, draft-04/07) throws on a `$ref`
 * beside `oneOf`/`anyOf`, which draft 2020-12 allows. Nuclei only does this
 * where the inline combinator repeats the referenced one, so the `$ref` goes.
 */
function dropRefBesideCombinator(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(dropRefBesideCombinator);
  if (!node || typeof node !== 'object') return node;
  const { $ref, ...rest } = node as Record<string, unknown>;
  const out = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, dropRefBesideCombinator(v)]),
  );
  return $ref === undefined || 'oneOf' in rest || 'anyOf' in rest
    ? out
    : { $ref, ...out };
}

export const nucleiSchema = dropRefBesideCombinator(raw) as Parameters<
  typeof yamlSchema
>[0];
