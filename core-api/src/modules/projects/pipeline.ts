import type { ToolCategory } from '@/common/enums/enum';
import type { WorkflowJob } from '../workflows/entities/workflow.entity';

/** One tool of a project pipeline, resolved to its name. */
export interface PipelineStep {
  run: string;
  category?: ToolCategory;
  config?: Record<string, unknown>;
  configProfileId?: string;
  /**
   * Position in the pipeline, from 1. Tools of one stage run in parallel; a
   * stage starts once every tool of the previous stage is done. Omitted = 1.
   */
  stage?: number;
}

/**
 * Builds the workflow `jobs` map of a staged pipeline. A job is keyed by its
 * tool name, or `<tool>_<category>` when one tool runs in several categories
 * (the graph refuses a tool repeated without distinct categories anyway).
 * Each job `needs` every job of the nearest earlier stage, so stages may skip
 * numbers without breaking the chain.
 */
export function buildPipelineJobs(
  steps: PipelineStep[],
): Record<string, WorkflowJob> {
  const counts = new Map<string, number>();
  for (const step of steps) {
    counts.set(step.run, (counts.get(step.run) ?? 0) + 1);
  }
  const idOf = (step: PipelineStep) =>
    (counts.get(step.run) ?? 0) > 1 && step.category
      ? `${step.run}_${step.category}`
      : step.run;

  const stageOf = (step: PipelineStep) =>
    Number.isInteger(step.stage) && (step.stage ?? 0) > 0 ? step.stage! : 1;
  const stages = [...new Set(steps.map(stageOf))].sort((a, b) => a - b);
  const idsByStage = new Map<number, string[]>();
  for (const step of steps) {
    const stage = stageOf(step);
    idsByStage.set(stage, [...(idsByStage.get(stage) ?? []), idOf(step)]);
  }

  return Object.fromEntries(
    steps.map((step) => {
      const position = stages.indexOf(stageOf(step));
      const needs =
        position > 0 ? (idsByStage.get(stages[position - 1]) ?? []) : [];
      const job: WorkflowJob = {
        run: step.run,
        ...(step.category ? { category: step.category } : {}),
        ...(needs.length > 0 ? { needs } : {}),
        ...(step.config ? { config: step.config } : {}),
        ...(step.configProfileId
          ? { configProfileId: step.configProfileId }
          : {}),
      };
      return [idOf(step), job];
    }),
  );
}

/**
 * Stage of every job of a workflow: 1 for a root, otherwise one more than the
 * deepest job it needs. The inverse of {@link buildPipelineJobs} for staged
 * pipelines, and the layering a hand-written DAG is edited as.
 */
export function pipelineStages(
  jobs: Record<string, Pick<WorkflowJob, 'needs'>>,
): Map<string, number> {
  const stages = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    const known = stages.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 1; // cycle: refused on write, flattened here
    path.add(id);
    const needs = (jobs[id]?.needs ?? []).filter((need) => need in jobs);
    const stage =
      needs.length === 0
        ? 1
        : 1 + Math.max(...needs.map((need) => visit(need, path)));
    path.delete(id);
    stages.set(id, stage);
    return stage;
  };
  for (const id of Object.keys(jobs)) visit(id, new Set());
  return stages;
}

/**
 * Whether a workflow file belongs to the project: workflows created for it
 * are named `project-<projectId>-…` (or `group-<projectId>.yaml` before the
 * Projects rename). Only these are edited and deleted with the project; any
 * other bound workflow is left alone.
 */
export function isProjectOwnedWorkflow(
  filePath: string | undefined | null,
  projectId: string,
): boolean {
  if (!filePath) return false;
  return (
    filePath === `group-${projectId}.yaml` ||
    filePath.startsWith(`project-${projectId}-`)
  );
}
