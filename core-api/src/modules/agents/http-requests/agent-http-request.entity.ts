import { bigintTransformer } from '@/modules/artifacts/entities/bigint.transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';
import { AgentConversation } from '../entities/agent-conversation.entity';
import { AgentHttpOutcome } from './agent-http-request.enums';

/**
 * One HTTP request an agent shell command made through the worker's egress
 * proxy. Headers and bodies live in `agent_http_request_payloads`, so the
 * list queries never read them.
 *
 * The `synchronize: false` indexes need DESC keys, an opclass, a partial
 * predicate or BRIN, which the decorator cannot express: their DDL is in the
 * AddAgentHttpRequests migration, and this keeps later generates from
 * dropping them.
 */
@Entity('agent_http_requests')
@Index('IDX_agent_http_conv_sent', { synchronize: false })
@Index('IDX_agent_http_owner_sent', { synchronize: false })
@Index('IDX_agent_http_owner_host_sent', { synchronize: false })
@Index('IDX_agent_http_problems', { synchronize: false })
@Index('IDX_agent_http_sent_brin', { synchronize: false })
@Index('IDX_agent_http_conv_run', ['conversationId', 'runId'])
export class AgentHttpRequest {
  /** Set by the worker (UUIDv7), so a retried batch cannot insert a row twice. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => AgentConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Relation<AgentConversation>;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toolCallId: string | null;

  /** The remote-execute session of the command. */
  @Column({ type: 'varchar', length: 64 })
  runId: string;

  @Column({ type: 'uuid', nullable: true })
  subagentId: string | null;

  /** Subagent name, or `main` for the main agent. */
  @Column({ type: 'varchar', length: 100 })
  agentName: string;

  @Column({ type: 'uuid', nullable: true })
  workerId: string | null;

  @Column({ type: 'varchar', length: 8 })
  scheme: string;

  /** Null for a CONNECT tunnel that was not intercepted. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 255 })
  host: string;

  @Column({ type: 'integer' })
  port: number;

  @Column({ type: 'text', nullable: true })
  path: string | null;

  @Column({ type: 'smallint', nullable: true })
  statusCode: number | null;

  @Column({ type: 'smallint' })
  outcome: AgentHttpOutcome;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  requestBytes: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  responseBytes: number;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @Column({ type: 'timestamptz' })
  completedAt: Date;

  @Column({ type: 'integer' })
  durationMs: number;

  @Column({ type: 'boolean', default: false })
  tlsIntercepted: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
