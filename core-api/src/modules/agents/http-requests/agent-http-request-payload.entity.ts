import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Relation } from 'typeorm';
import { AgentHttpRequest } from './agent-http-request.entity';

/** A header as sent: [name, value], in order, duplicates kept. */
export type HttpHeaderPair = [string, string];

/** Headers and bodies of one `agent_http_requests` row, read only on detail. */
@Entity('agent_http_request_payloads')
export class AgentHttpRequestPayload {
  @PrimaryColumn({ type: 'uuid' })
  requestId: string;

  // ManyToOne, not OneToOne: OneToOne would add a UNIQUE constraint on a
  // column the primary key already makes unique.
  @ManyToOne(() => AgentHttpRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: Relation<AgentHttpRequest>;

  @Column({ type: 'jsonb', nullable: true })
  requestHeaders: HttpHeaderPair[] | null;

  @Column({ type: 'jsonb', nullable: true })
  responseHeaders: HttpHeaderPair[] | null;

  @Column({ type: 'text', nullable: true })
  requestBody: string | null;

  @Column({ type: 'text', nullable: true })
  responseBody: string | null;

  /** How the body is stored: `base64` for a binary or non-UTF-8 body. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  requestBodyEncoding: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  responseBodyEncoding: string | null;

  @Column({ type: 'boolean', default: false })
  requestBodyTruncated: boolean;

  @Column({ type: 'boolean', default: false })
  responseBodyTruncated: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contentType: string | null;
}
