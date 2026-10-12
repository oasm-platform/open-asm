import type { WrapperType } from '@/common/types/app.types';
import { JobRunType, JobStatus } from '@/common/enums/enum';
import type { CreateJobs } from '@/modules/jobs-registry/dto/jobs-registry.dto';
import {
  agentJobDoneChannel,
  type AgentJobDoneMessage,
  JobsRegistryService,
} from '@/modules/jobs-registry/jobs-registry.service';
import { ToolsService } from '@/modules/tools/tools.service';
import { RemoteExecuteSubscribeService } from '@/modules/workers/remote-execute-subscribe.service';
import { RedisService } from '@/services/redis/redis.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';

export const AGENT_MAX_JOBS_PER_CALL = 20;
export const AGENT_RUN_TIMEOUT_MS = 5 * 60_000;
const TOTAL_EXCERPT_MAX = 32 * 1024;

export interface AgentConnectorRunInput {
  workspaceId: string;
  conversationId: string;
  slug: string;
  targetIds: string[];
  assetIds: string[];
  configProfileId?: string;
  toolCallId: string;
  abortSignal?: AbortSignal;
}

export type AgentConnectorRunResult =
  | { error: string }
  | {
      jobHistoryId: string;
      status: 'completed' | 'partial' | 'failed' | 'running';
      jobs: {
        jobId: string;
        asset: string;
        status: JobStatus | 'running';
        error?: string;
        excerpt?: string;
      }[];
      note: string;
    };

/**
 * Runs a connector for an agent on the agent lane: jobs are created
 * IN_PROGRESS on the conversation's worker, pushed over the agent stream, and
 * awaited on Redis. Registry jobs and their concurrency are never involved.
 */
@Injectable()
export class AgentConnectorRunService {
  constructor(
    private readonly toolsService: ToolsService,
    @Inject(forwardRef(() => JobsRegistryService))
    private readonly jobsRegistry: WrapperType<JobsRegistryService>,
    private readonly streams: RemoteExecuteSubscribeService,
    private readonly redis: RedisService,
  ) {}

  async run(
    input: AgentConnectorRunInput,
    timeoutMs = AGENT_RUN_TIMEOUT_MS,
  ): Promise<AgentConnectorRunResult> {
    // Tool.name IS the connector slug; getToolById(workspaceId) sets
    // isInstalled from workspace_tools, so a foreign connector cannot run.
    const [toolRow] = await this.toolsService.getToolByNames({ names: [input.slug] });
    const tool = toolRow?.id
      ? await this.toolsService.getToolById(toolRow.id, input.workspaceId)
      : null;
    if (!tool?.isInstalled) {
      return { error: `Connector ${input.slug} is not installed in this workspace.` };
    }

    const workerId = await this.streams.resolveConversationWorker(
      input.conversationId,
      input.workspaceId,
    );
    if (!workerId) {
      return {
        error: 'No worker available for this workspace. Select a workspace worker for this conversation.',
      };
    }

    let jobs: Awaited<ReturnType<JobsRegistryService['createNewJob']>>;
    try {
      jobs = await this.jobsRegistry.createNewJob({
        tool,
        workspaceId: input.workspaceId,
        targetIds: input.targetIds,
        assetIds: input.assetIds,
        configProfileId: input.configProfileId,
        priority: tool.priority,
        jobName: `agent:${input.slug}`,
        jobRunType: JobRunType.AGENT,
        assignWorkerId: workerId,
        maxJobs: AGENT_MAX_JOBS_PER_CALL,
      } as CreateJobs);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    if (jobs.length === 0) {
      return { error: 'No matching assets for this connector; nothing to run.' };
    }

    const jobHistoryId = jobs[0].jobHistory.id;
    const assetByJob = new Map(jobs.map((job) => [job.id, job.asset?.value ?? '']));
    const outcomes = new Map<string, AgentJobDoneMessage>();
    const channel = agentJobDoneChannel(jobHistoryId);
    let allDone!: () => void;
    const finished = new Promise<void>((resolve) => (allDone = resolve));

    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    try {
      // Subscribe BEFORE pushing so a fast job cannot finish unheard.
      await this.redis.subscribe(channel, (ch, raw) => {
        if (ch !== channel) return;
        try {
          const message = JSON.parse(raw) as AgentJobDoneMessage;
          if (!assetByJob.has(message.jobId)) return;
          outcomes.set(message.jobId, message);
          if (outcomes.size === assetByJob.size) allDone();
        } catch {
          // Malformed message: ignore, the timeout still bounds the wait.
        }
      });

      const payloads = await this.jobsRegistry.buildAgentGrpcJobs(jobs.map((job) => job.id));
      const unpushed: string[] = [];
      for (const payload of payloads) {
        if (unpushed.length > 0 || !this.streams.pushConnectorJob(workerId, input.toolCallId, payload)) {
          unpushed.push(payload.id as string);
        }
      }
      if (unpushed.length > 0) {
        // Publishes FAILED for each, so the wait below still completes.
        await this.jobsRegistry.failAgentJobs({ jobIds: unpushed }, 'worker stream closed before dispatch');
      }

      const outcome = await new Promise<'done' | 'timeout' | 'aborted'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
        onAbort = () => resolve('aborted');
        if (input.abortSignal?.aborted) resolve('aborted');
        input.abortSignal?.addEventListener('abort', onAbort, { once: true });
        void finished.then(() => resolve('done'));
      });

      if (outcome === 'aborted') {
        try {
          await this.jobsRegistry.cancelJobHistory(input.workspaceId, jobHistoryId);
        } catch {
          // Best effort: the jobs still end on their own timeout.
        }
        return { error: 'Cancelled by user' };
      }
      return this.summarize(jobHistoryId, jobs.map((job) => job.id), assetByJob, outcomes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Jobs exist IN_PROGRESS; fail them so none is orphaned.
      await this.jobsRegistry
        .failAgentJobs({ jobIds: jobs.map((job) => job.id) }, `agent dispatch failed: ${message}`)
        .catch(() => undefined);
      return { error: message };
    } finally {
      clearTimeout(timer);
      if (onAbort) input.abortSignal?.removeEventListener('abort', onAbort);
      await this.redis.unsubscribe(channel).catch(() => undefined);
    }
  }

  private summarize(
    jobHistoryId: string,
    jobIds: string[],
    assetByJob: Map<string, string>,
    outcomes: Map<string, AgentJobDoneMessage>,
  ): AgentConnectorRunResult {
    let budget = TOTAL_EXCERPT_MAX;
    const rows = jobIds.map((jobId) => {
      const outcome = outcomes.get(jobId);
      const excerpt = outcome?.excerpt?.slice(0, budget) || undefined;
      budget -= excerpt?.length ?? 0;
      return {
        jobId,
        asset: assetByJob.get(jobId) ?? '',
        status: outcome?.status ?? ('running' as const),
        error: outcome?.error,
        excerpt,
      };
    });
    const completed = rows.filter((row) => row.status === JobStatus.COMPLETED).length;
    const status = rows.some((row) => row.status === 'running')
      ? 'running'
      : completed === rows.length
        ? 'completed'
        : completed === 0
          ? 'failed'
          : 'partial';
    return {
      jobHistoryId,
      status,
      jobs: rows,
      note:
        status === 'running'
          ? 'Some jobs are still running; findings are saved as they finish. Check them with review_jobs.'
          : 'Findings are saved; use discover_vulnerabilities / list_network_ports for full detail.',
    };
  }
}
