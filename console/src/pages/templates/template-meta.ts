import { parseDocument } from 'yaml';

// Top-level request blocks a Nuclei template can carry.
const PROTOCOLS = [
  'http',
  'dns',
  'tcp',
  'network',
  'file',
  'headless',
  'ssl',
  'websocket',
  'whois',
  'code',
  'javascript',
  'workflows',
] as const;

export type TemplateMeta = {
  /** First YAML syntax error, if any. */
  error?: { message: string; line?: number };
  id?: string;
  name?: string;
  severity?: string;
  protocol?: string;
  tags: string[];
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Header fields for the editor's info bar, read from the template text. */
export function readTemplateMeta(content: string): TemplateMeta {
  const doc = parseDocument(content);
  const [err] = doc.errors;
  if (err) {
    return {
      error: { message: err.message.split('\n')[0], line: err.linePos?.[0]?.line },
      tags: [],
    };
  }
  let root: Record<string, unknown> = {};
  try {
    const js: unknown = doc.toJS();
    if (js && typeof js === 'object' && !Array.isArray(js)) root = js as Record<string, unknown>;
  } catch {
    // toJS throws on things like unresolved aliases; show no metadata then.
  }
  const info = (root.info && typeof root.info === 'object' ? root.info : {}) as Record<
    string,
    unknown
  >;
  const rawTags = info.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.map(str).filter((t): t is string => !!t)
    : (str(rawTags)?.split(',').map((t) => t.trim()).filter(Boolean) ?? []);
  return {
    id: str(root.id),
    name: str(info.name),
    severity: str(info.severity)?.toLowerCase(),
    protocol: PROTOCOLS.find((p) => p in root),
    tags,
  };
}
