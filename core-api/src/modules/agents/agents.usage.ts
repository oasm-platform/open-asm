import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentUsageResponseDto,
  GetAgentUsageQueryDto,
  UsageModelDto,
  UsageSessionDto,
  UsageTotalsDto,
} from './dto/usage.dto';
import { AgentConversation } from './entities/agent-conversation.entity';

export const USAGE_TOP_SESSIONS = 10;

/** Usage of one conversation and model on one day. */
export interface UsageRow {
  date: string;
  conversationId: string;
  title: string | null;
  model: string;
  provider: string | null;
  lastAt: Date;
  responses: number;
  subagentRuns: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  costComplete: boolean;
}

/**
 * Stats of every finished answer (assistant message) and subagent run of the
 * user's conversations since local midnight of the first day ($3) in the
 * time zone $4. Timestamp columns hold UTC.
 */
const USAGE_SQL = `
WITH scope AS (
  SELECT id, title FROM agent_conversations
  WHERE "workspaceId" = $1 AND "createdBy" = $2
),
since AS (
  SELECT ($3::date::timestamp AT TIME ZONE $4) AT TIME ZONE 'UTC' AS at
),
events AS (
  SELECT m."conversationId", m."createdAt" AS at, m.metadata->>'model' AS model,
         m.metadata->>'provider' AS provider, m.metadata->'stats' AS stats,
         false AS subagent
  FROM agent_messages m
  JOIN scope c ON c.id = m."conversationId"
  WHERE m.role = 'assistant' AND m.metadata->'stats' IS NOT NULL
    AND m."createdAt" >= (SELECT at FROM since)
  UNION ALL
  SELECT s."conversationId", s."completedAt", s.metadata->>'model',
         s.metadata->>'provider', s.metadata->'stats', true
  FROM agent_subagents s
  JOIN scope c ON c.id = s."conversationId"
  WHERE s.metadata->'stats' IS NOT NULL
    AND s."completedAt" >= (SELECT at FROM since)
)
SELECT ((e.at AT TIME ZONE 'UTC') AT TIME ZONE $4)::date::text AS date,
       e."conversationId" AS "conversationId",
       c.title,
       COALESCE(e.model, 'unknown') AS model,
       e.provider,
       MAX(e.at) AT TIME ZONE 'UTC' AS "lastAt",
       (COUNT(*) FILTER (WHERE NOT e.subagent))::int AS responses,
       (COUNT(*) FILTER (WHERE e.subagent))::int AS "subagentRuns",
       COALESCE(SUM((e.stats->>'steps')::float8), 0) AS requests,
       COALESCE(SUM((e.stats->>'inputTokens')::float8), 0) AS "inputTokens",
       COALESCE(SUM((e.stats->>'outputTokens')::float8), 0) AS "outputTokens",
       COALESCE(SUM((e.stats->>'cacheReadTokens')::float8), 0) AS "cacheReadTokens",
       COALESCE(SUM((e.stats->>'costUsd')::float8), 0) AS "costUsd",
       BOOL_AND(e.stats->>'costUsd' IS NOT NULL) AS "costComplete"
FROM events e
JOIN scope c ON c.id = e."conversationId"
GROUP BY 1, 2, 3, 4, 5
`;

/** The last `days` calendar days in `tz`, oldest first, as YYYY-MM-DD. */
export function usageDates(days: number, tz: string, now = new Date()): string[] {
  // en-CA formats as YYYY-MM-DD
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (days - 1 - i))).toISOString().slice(0, 10),
  );
}

const emptyTotals = (): UsageTotalsDto => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0,
  costComplete: true,
});

function addTotals(into: UsageTotalsDto, row: UsageRow): void {
  into.requests += row.requests;
  into.inputTokens += row.inputTokens;
  into.outputTokens += row.outputTokens;
  into.cacheReadTokens += row.cacheReadTokens;
  into.costUsd += row.costUsd;
  into.costComplete = into.costComplete && row.costComplete;
}

const byTokens = (a: UsageTotalsDto, b: UsageTotalsDto) =>
  b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);

/** Pure roll-up of the usage rows into the summary, days, models and sessions. */
export function summarizeUsage(
  rows: UsageRow[],
  dates: string[],
  tz: string,
): AgentUsageResponseDto {
  const summary = {
    ...emptyTotals(),
    sessions: 0,
    responses: 0,
    subagentRuns: 0,
  };
  const daily = new Map(dates.map((date) => [date, { date, ...emptyTotals() }]));
  const models = new Map<string, UsageModelDto>();
  const sessions = new Map<string, UsageSessionDto>();

  for (const row of rows) {
    addTotals(summary, row);
    summary.responses += row.responses;
    summary.subagentRuns += row.subagentRuns;

    const day = daily.get(row.date);
    if (day) addTotals(day, row);

    const modelKey = `${row.provider ?? ''}/${row.model}`;
    let model = models.get(modelKey);
    if (!model) {
      model = { model: row.model, provider: row.provider, ...emptyTotals() };
      models.set(modelKey, model);
    }
    addTotals(model, row);

    let session = sessions.get(row.conversationId);
    if (!session) {
      session = {
        id: row.conversationId,
        title: row.title,
        lastActiveAt: row.lastAt,
        ...emptyTotals(),
      };
      sessions.set(row.conversationId, session);
    }
    addTotals(session, row);
    if (row.lastAt > session.lastActiveAt) session.lastActiveAt = row.lastAt;
  }
  summary.sessions = sessions.size;

  return {
    days: dates.length,
    tz,
    summary,
    daily: [...daily.values()],
    models: [...models.values()].sort(byTokens),
    sessions: [...sessions.values()].sort(byTokens).slice(0, USAGE_TOP_SESSIONS),
  };
}

/** Token, cost and session usage of AI Studio for one user in one workspace. */
@Injectable()
export class AgentsUsageService {
  constructor(
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
  ) {}

  async getUsage(
    workspaceId: string,
    userId: string,
    { days, tz }: GetAgentUsageQueryDto,
  ): Promise<AgentUsageResponseDto> {
    const dates = usageDates(days, tz);
    const rows: UsageRow[] = await this.conversationRepository.query(
      USAGE_SQL,
      [workspaceId, userId, dates[0], tz],
    );
    return summarizeUsage(rows, dates, tz);
  }
}
