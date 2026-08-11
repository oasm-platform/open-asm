import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import {
  Column,
  Entity,
  Generated,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * Append-only audit trail row (mirrors the `audit_events` DDL in
 * 1786800000000-CreateAuditEvents.ts).
 *
 * Deliberately does NOT extend BaseEntity: there is no `updatedAt` — the time
 * axis is `occurredAt`, and rows are immutable (guarded by the
 * `audit_events_no_modify` trigger). The migration is the source of truth for
 * DDL (synchronize: false); the decorators below document the schema.
 */
@Entity('audit_events')
@Index('IDX_ae_workspace_time', ['workspaceId', 'occurredAt'])
@Index('IDX_ae_workspace_action', ['workspaceId', 'action', 'occurredAt'])
@Index('IDX_ae_workspace_resource', [
  'workspaceId',
  'resourceType',
  'resourceId',
  'occurredAt',
])
@Index('IDX_ae_workspace_actor', ['workspaceId', 'actorId', 'occurredAt'])
export class AuditEvent {
  @PrimaryColumn('uuid')
  @Generated('uuid')
  id: string;

  /** NULL = platform/global event (auth events, deferred to v1.1). */
  @Column({ type: 'uuid', nullable: true })
  workspaceId?: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ type: 'uuid', nullable: true })
  actorId?: string;

  @Column({ type: 'varchar', length: 16, default: AuditActorType.User })
  actorType: AuditActorType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorEmail?: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32 })
  resourceType: string;

  @Column({ type: 'uuid', nullable: true })
  resourceId?: string;

  @Column({ type: 'varchar', length: 8, default: AuditOutcome.Success })
  outcome: AuditOutcome;

  @Column({ type: 'inet', nullable: true })
  sourceIp?: string;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'uuid', nullable: true })
  requestId?: string;

  @Column({ type: 'uuid', nullable: true })
  correlationId?: string;

  /** Only fields that changed; values are scalar or nested diff payloads. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  changes: Record<string, { before?: unknown; after?: unknown }>;

  /**
   * Scalar-only context (counts, ids, enums, id lists). Stored as jsonb so
   * list values (e.g. invitationIds) are fine. Secrets never reach here.
   */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, string | number | boolean | string[]>;
}
