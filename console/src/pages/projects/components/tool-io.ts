import { t } from '@/lib/i18n-dictionary';
import {
  DataKind,
  type Tool,
  type ToolCategory,
  type ToolCategorySpec,
} from '@/services/apis/gen/queries';

/**
 * What a tool takes and finds, in words, and what a pipeline is missing for
 * it. The rules mirror core-api's step planning (docs/workflows.md): a tool
 * takes, per asset, the first of its input kinds that has something.
 */

/** Plural nouns for the kinds, as read in "takes web services"; resolved on read. */
export const KIND_LABEL: Record<DataKind, string> = {
  get target() {
    return t('projects.kind.target');
  },
  get host() {
    return t('projects.kind.host');
  },
  get service() {
    return t('projects.kind.service');
  },
  get web() {
    return t('projects.kind.web');
  },
  get url() {
    return t('projects.kind.url');
  },
  get repository() {
    return t('projects.kind.repository');
  },
  get vulnerability() {
    return t('projects.kind.vulnerability');
  },
};

/** Every run has these from the start: they come with the targets. */
const IN_EVERY_SCOPE: DataKind[] = [
  DataKind.target,
  DataKind.host,
  DataKind.repository,
];

/** The category a tool runs in: the chosen one, else its first. */
export function capabilityOf(
  tool: Pick<Tool, 'categories'>,
  category?: ToolCategory,
): ToolCategorySpec | undefined {
  return (
    tool.categories?.find((c) => c.name === category) ?? tool.categories?.[0]
  );
}

/** "web services, else hosts" */
export function describeKinds(kinds: readonly DataKind[]): string {
  return kinds.map((kind) => KIND_LABEL[kind]).join(t('projects.toolIo.elseSeparator'));
}

/**
 * Why a tool may find little to scan: no earlier step finds the kinds it
 * prefers. Undefined when an earlier step (or every run) provides its first
 * choice.
 *
 * @param inputs the tool's input kinds, best first
 * @param earlier what the tools of the earlier steps produce
 */
export function pipelineHint(
  inputs: readonly DataKind[],
  earlier: readonly DataKind[],
): string | undefined {
  const available = (kind: DataKind) =>
    IN_EVERY_SCOPE.includes(kind) || earlier.includes(kind);
  if (inputs.length === 0 || available(inputs[0])) return undefined;
  const fallback = inputs.find(available);
  const wanted = KIND_LABEL[inputs[0]];
  return fallback
    ? t('projects.toolIo.hintFallback', { wanted, fallback: KIND_LABEL[fallback] })
    : t('projects.toolIo.hintOnly', { wanted });
}
