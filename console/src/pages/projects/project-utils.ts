import { getNextRun } from '@/lib/cron-schedule';
import { SEVERITY_BG_CLASS, SEVERITY_TEXT_CLASS } from '@/pages/dashboard/severity';
import type { PipelineToolEntry } from '@/pages/projects/components/tool-pipeline-builder';
import {
  JobRunType,
  ProjectTriggerEvent,
  ProjectTriggerType,
  RunOutcome,
  type EventTriggerConfig,
  type ProjectToolInput,
  type SeverityCountsDto,
  type Tool,
  type DataKind,
  type ToolCategory,
  type WorkflowContent,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useCallback } from 'react';

/** Tabs of the project page, in order; the first one is the default. */
export const PROJECT_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'assets', label: 'Assets' },
  { value: 'vulnerabilities', label: 'Vulnerabilities' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'runs', label: 'Runs' },
  { value: 'settings', label: 'Settings' },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]['value'];

export const isProjectTab = (tab: string | undefined): tab is ProjectTab =>
  PROJECT_TABS.some((t) => t.value === tab);

/** Severities from the worst down, in the dashboard's colours. */
export const SEVERITIES = [
  { key: 'critical', label: 'Critical', bar: SEVERITY_BG_CLASS.critical, text: SEVERITY_TEXT_CLASS.critical },
  { key: 'high', label: 'High', bar: SEVERITY_BG_CLASS.high, text: SEVERITY_TEXT_CLASS.high },
  { key: 'medium', label: 'Medium', bar: SEVERITY_BG_CLASS.medium, text: SEVERITY_TEXT_CLASS.medium },
  { key: 'low', label: 'Low', bar: SEVERITY_BG_CLASS.low, text: SEVERITY_TEXT_CLASS.low },
  { key: 'info', label: 'Info', bar: SEVERITY_BG_CLASS.info, text: SEVERITY_TEXT_CLASS.info },
] as const satisfies ReadonlyArray<{
  key: keyof SeverityCountsDto;
  label: string;
  bar: string;
  text: string;
}>;

/** "1 asset", "3 assets". */
export const assetCount = (n: number) => `${n} asset${n === 1 ? '' : 's'}`;

export const totalOf = (counts?: SeverityCountsDto | null) =>
  counts
    ? counts.critical + counts.high + counts.medium + counts.low + counts.info
    : 0;

/** Message of an API error, or the fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as AxiosError<{ message?: string | string[] }>)
    ?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || fallback;
}

/**
 * Refetches everything under `/api/projects` (lists, detail, tabs): a change
 * in one tab moves counts in the header and the others.
 */
export function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return useCallback(
    // `except` skips a deleted project, whose open queries would refetch to 404.
    (except?: string) =>
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0] ?? '');
          return (
            key.startsWith('/api/projects') &&
            !(except && key.startsWith(`/api/projects/${except}`))
          );
        },
      }),
    [queryClient],
  );
}

interface CronTriggerLike {
  type: ProjectTriggerType;
  cron?: string | null;
  enabled: boolean;
}

/** Soonest next run among the enabled cron triggers, or null. */
export function nextCronRun(
  triggers: CronTriggerLike[],
  timezone: string,
  from: Date = new Date(),
): Date | null {
  return triggers
    .filter((t) => t.type === ProjectTriggerType.cron && t.enabled && t.cron)
    .map((t) => getNextRun(t.cron!, timezone, from))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

/** What each event a project workflow can run on is called. */
export const TRIGGER_EVENT_LABELS: Record<ProjectTriggerEvent, string> = {
  [ProjectTriggerEvent.projectassetsadded]: 'Assets added',
  [ProjectTriggerEvent.projectruncompleted]: 'After a workflow',
  [ProjectTriggerEvent.vulnerabilitydetected]: 'Vulnerability found',
};

/**
 * "Manual", "Schedule", or the event that started a run ("Assets added",
 * "After a workflow", "Vulnerability found").
 */
export function runTriggerLabel(
  jobRunType?: string | null,
  triggerEvent?: string | null,
): string {
  if (jobRunType === JobRunType.scheduled) return 'Schedule';
  if (jobRunType === JobRunType.event) {
    return TRIGGER_EVENT_LABELS[triggerEvent as ProjectTriggerEvent] ?? 'Event';
  }
  return 'Manual';
}

/** "critical, high" from a list of values. */
const listOf = (values?: string[]) => (values ?? []).join(', ').toLowerCase();

/**
 * What an event trigger waits for, and how it gathers: the condition column
 * of the Schedule tab.
 */
export function eventConditionLabel(
  event: ProjectTriggerEvent | null | undefined,
  config: EventTriggerConfig,
): { title: string; detail: string } {
  const window = config.windowMinutes ?? 10;
  const gather = window === 0 ? 'starts right away' : `gathers ${window} min`;
  const detail = [
    gather,
    `up to ${config.maxAssets ?? 200} assets/run`,
    ...(config.targetTypes?.length ? [`only ${listOf(config.targetTypes)}`] : []),
  ].join(' · ');
  switch (event) {
    case ProjectTriggerEvent.projectruncompleted: {
      const status = config.status ?? [RunOutcome.success];
      const outcome =
        status.length === 2 ? 'finishes' : status[0] === RunOutcome.failure ? 'fails' : 'succeeds';
      const after = config.workflows?.length ? config.workflows.join(', ') : 'any other workflow';
      return { title: `When ${after} ${outcome}`, detail };
    }
    case ProjectTriggerEvent.vulnerabilitydetected:
      return {
        title: `On ${listOf(config.severity ?? ['critical', 'high'])} findings`,
        detail,
      };
    default:
      return { title: 'When assets join the project', detail };
  }
}

/**
 * Display name of a project workflow. Pipelines created before Projects were
 * named "Group Workflow - <id>", which says nothing to a reader.
 */
export function workflowLabel(workflow?: { name?: string } | null): string {
  const name = workflow?.name?.trim();
  if (!name || /^Group Workflow - /.test(name)) return 'Pipeline';
  return name;
}

type JobLike = {
  run: string;
  needs?: string | string[];
  category?: ToolCategory;
  input?: DataKind[];
  config?: Record<string, unknown>;
  configProfileId?: string;
};

/** Jobs of a workflow content, whatever its stored shape. */
export function jobsOf(content?: WorkflowContent | null): [string, JobLike][] {
  const jobs = (content?.jobs ?? {}) as unknown;
  if (Array.isArray(jobs)) {
    return (jobs as JobLike[]).map((job, i) => [job.run ?? String(i), job]);
  }
  return Object.entries(jobs as Record<string, JobLike>);
}

/**
 * Step of every job: 1 for a root, else one more than the deepest job it
 * needs. Mirrors the API, which stores steps as `needs`.
 */
export function jobStages(content?: WorkflowContent | null): Map<string, number> {
  const jobs = new Map(jobsOf(content));
  const stages = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    const known = stages.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) return 1;
    path.add(id);
    const needs = [jobs.get(id)?.needs ?? []]
      .flat()
      .filter((need) => jobs.has(need));
    const stage = needs.length
      ? 1 + Math.max(...needs.map((need) => visit(need, path)))
      : 1;
    path.delete(id);
    stages.set(id, stage);
    return stage;
  };
  for (const id of jobs.keys()) visit(id, new Set());
  return stages;
}

/** Tool names grouped by step, in order: [["subfinder"], ["httpx"], …]. */
export function pipelineSteps(content?: WorkflowContent | null): string[][] {
  const stages = jobStages(content);
  const steps: string[][] = [];
  for (const [id, job] of jobsOf(content)) {
    const stage = stages.get(id) ?? 1;
    (steps[stage - 1] ??= []).push(job.run);
  }
  return steps.filter(Boolean);
}

/** A stored pipeline as builder entries, so it can be edited. */
export function entriesFromContent(
  content: WorkflowContent | null | undefined,
  tools: Tool[],
): PipelineToolEntry[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const stages = jobStages(content);
  return jobsOf(content).flatMap(([id, job]) => {
    const tool = byName.get(job.run);
    if (!tool) return [];
    return [
      {
        toolId: tool.id,
        ...(job.category ? { category: job.category } : {}),
        ...(job.input?.length ? { input: job.input } : {}),
        ...(job.config ? { config: job.config } : {}),
        ...(job.configProfileId ? { configProfileId: job.configProfileId } : {}),
        stage: stages.get(id) ?? 1,
      },
    ];
  });
}

/** Builder entries as the API's tool inputs. */
export const toToolInputs = (entries: PipelineToolEntry[]): ProjectToolInput[] =>
  entries.map((entry) => ({
    toolId: entry.toolId,
    ...(entry.config ? { config: entry.config } : {}),
    ...(entry.configProfileId ? { configProfileId: entry.configProfileId } : {}),
    ...(entry.category ? { category: entry.category } : {}),
    ...(entry.input?.length ? { input: entry.input } : {}),
    ...(entry.stage && entry.stage > 1 ? { stage: entry.stage } : {}),
  }));
