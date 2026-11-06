import { BOT_ID } from '@/common/constants/app.constants';
import {
  AuditActorType,
  AuditOutcome,
  IssueCommentType,
  IssueStatus,
} from '@/common/enums/enum';
import type { IssueLinkResourceType } from '@/common/enums/enum';
import { Comment } from '@/modules/comments/entities/comment.entity';
import type { CatalogEvent } from '@/modules/event-bridge/contracts/event-catalog';
import type { EventEnvelopeData } from '@/modules/event-bridge/contracts/event-envelope';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { type EntityManager, QueryFailedError } from 'typeorm';
import { IssueLink } from './entities/issue-link.entity';

/** Statuses in which an issue is still being worked on. */
export const ACTIVE_ISSUE_STATUSES: readonly IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.IN_PROGRESS,
];

export const isActiveStatus = (status: IssueStatus): boolean =>
  ACTIVE_ISSUE_STATUSES.includes(status);

/**
 * Next per-workspace issue number, taken from the workspace counter. The
 * upsert row-locks the counter until the transaction ends, so concurrent
 * inserts number one after the other; a rolled-back insert returns its number.
 * Numbers are never reused after a delete. The unique (workspaceId, no) index
 * is the backstop.
 */
export async function nextIssueNo(
  manager: EntityManager,
  workspaceId: string,
): Promise<number> {
  const rows: { lastNo: number | string }[] = await manager.query(
    `INSERT INTO "issue_counters" ("workspaceId", "lastNo")
     VALUES ($1, COALESCE((SELECT MAX("no") FROM "issues" WHERE "workspaceId" = $1), 0) + 1)
     ON CONFLICT ("workspaceId")
     DO UPDATE SET "lastNo" = "issue_counters"."lastNo" + 1
     RETURNING "lastNo"`,
    [workspaceId],
  );
  return Number(rows[0]?.lastNo ?? 1);
}

/** Postgres unique violation (23505), e.g. the open-groupKey index. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

/**
 * Writes a system comment on an issue: not editable or deletable. Automation
 * signs as the bot user; a person's status change signs as that person.
 */
export async function writeSystemComment(
  manager: EntityManager,
  issueId: string,
  content: string,
  type: IssueCommentType = IssueCommentType.SYSTEM,
  createdById: string = BOT_ID,
): Promise<void> {
  const repo = manager.getRepository(Comment);
  await repo.save(
    repo.create({
      issueId,
      content,
      type,
      createdById,
      isCanEdit: false,
      isCanDelete: false,
    }),
  );
}

/** Who caused an issue event: a user, or the automation (system). */
export type IssueActor = { userId: string } | 'system';

/** Publishes issue events in one shape. */
@Injectable()
export class IssueEventsPublisher {
  constructor(private readonly eventBridge: EventBridgeService) {}

  async publish(
    event: CatalogEvent,
    issue: { id: string; workspaceId: string; no?: number; type?: string },
    actor: IssueActor,
    metadata: Record<string, string | number | boolean | string[]> = {},
    changes?: EventEnvelopeData['changes'],
  ): Promise<void> {
    await this.eventBridge.publishSafely(
      event,
      {
        workspaceId: issue.workspaceId,
        actor:
          actor === 'system'
            ? { type: AuditActorType.System }
            : { id: actor.userId, type: AuditActorType.User },
        outcome: AuditOutcome.Success,
        resourceType: 'issue',
        resourceId: issue.id,
        metadata: {
          ...(issue.no !== undefined ? { no: issue.no } : {}),
          ...(issue.type ? { type: issue.type } : {}),
          ...metadata,
        },
        ...(changes ? { changes } : {}),
      } satisfies EventEnvelopeData,
      { subject: `workspace:${issue.workspaceId}/issue:${issue.id}` },
    );
  }
}

/** Throws 400 unless `userId` is a member of the workspace (e.g. an assignee). */
export async function assertWorkspaceMember(
  runner: Pick<EntityManager, 'query'>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const rows: unknown[] = await runner.query(
    'SELECT 1 FROM "workspace_members" WHERE "workspaceId" = $1 AND "userId" = $2 LIMIT 1',
    [workspaceId, userId],
  );
  if (rows.length === 0) {
    throw new BadRequestException('The assignee is not a member of this workspace');
  }
}

/**
 * Inserts links, skipping any the issue already has (unique triple). Returns
 * how many were new.
 */
export async function insertLinks(
  manager: EntityManager,
  issueId: string,
  links: { resourceType: IssueLinkResourceType; resourceId: string }[],
  addedById: string | null,
): Promise<number> {
  if (links.length === 0) return 0;
  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(IssueLink)
    .values(
      links.map((link) => ({
        issueId,
        resourceType: link.resourceType,
        resourceId: link.resourceId,
        addedById,
      })),
    )
    .orIgnore()
    .execute();
  return Array.isArray(result.raw) ? result.raw.length : links.length;
}

/** The same (type, id) pair once, in first-seen order. */
export function uniqueLinks<
  T extends { resourceType: IssueLinkResourceType; resourceId: string },
>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.resourceType}:${link.resourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
