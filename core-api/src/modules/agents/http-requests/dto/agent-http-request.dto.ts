import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const AGENT_HTTP_OUTCOMES = [
  'allowed',
  'denied',
  'upstream_error',
  'cancelled',
] as const;
export type AgentHttpOutcomeName = (typeof AGENT_HTTP_OUTCOMES)[number];

export const AGENT_HTTP_STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'] as const;
export type AgentHttpStatusClass = (typeof AGENT_HTTP_STATUS_CLASSES)[number];

export const AGENT_HTTP_LIST_MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Keyset-paginated, newest first: the table only grows, so no total. */
export class GetAgentHttpRequestsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Remote-execute session of the command' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  runId?: string;

  @ApiPropertyOptional({ description: 'Subagent name, or `main`' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subagentId?: string;

  @ApiPropertyOptional({ description: 'Host prefix, case-insensitive' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional({ example: 'GET' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{1,16}$/)
  method?: string;

  @ApiPropertyOptional({ enum: AGENT_HTTP_STATUS_CLASSES })
  @IsOptional()
  @IsIn(AGENT_HTTP_STATUS_CLASSES)
  statusClass?: AgentHttpStatusClass;

  @ApiPropertyOptional({ enum: AGENT_HTTP_OUTCOMES })
  @IsOptional()
  @IsIn(AGENT_HTTP_OUTCOMES)
  outcome?: AgentHttpOutcomeName;

  @ApiPropertyOptional({
    description: 'Only requests that were not allowed or got a status >= 400',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  errorsOnly?: boolean;

  @ApiPropertyOptional({ description: 'Sent at or after (ISO date)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Sent at or before (ISO date)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    default: 50,
    minimum: 1,
    maximum: AGENT_HTTP_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AGENT_HTTP_LIST_MAX_LIMIT)
  limit: number = 50;

  @ApiPropertyOptional({
    description:
      'Opaque keyset cursor; page forward with the nextCursor of the previous response',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class AgentHttpRequestListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ type: String, nullable: true })
  conversationTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  toolCallId: string | null;

  @ApiProperty({ description: 'Remote-execute session of the command' })
  runId: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  subagentId: string | null;

  @ApiProperty({ description: 'Subagent name, or `main`' })
  agentName: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  workerId: string | null;

  @ApiProperty({ example: 'https' })
  scheme: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for a CONNECT tunnel that was not intercepted',
  })
  method: string | null;

  @ApiProperty()
  host: string;

  @ApiProperty()
  port: number;

  @ApiProperty({ type: String, nullable: true })
  path: string | null;

  @ApiProperty({ type: Number, nullable: true })
  statusCode: number | null;

  @ApiProperty({ enum: AGENT_HTTP_OUTCOMES })
  outcome: AgentHttpOutcomeName;

  @ApiProperty({ type: String, nullable: true })
  error: string | null;

  @ApiProperty()
  requestBytes: number;

  @ApiProperty()
  responseBytes: number;

  @ApiProperty()
  sentAt: Date;

  @ApiProperty()
  completedAt: Date;

  @ApiProperty()
  durationMs: number;

  @ApiProperty()
  tlsIntercepted: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class AgentHttpRequestListResponseDto {
  @ApiProperty({ type: () => [AgentHttpRequestListItemDto] })
  data: AgentHttpRequestListItemDto[];

  /** Null on the last page. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor: string | null;
}

export class AgentHttpHeaderDto {
  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Sensitive values are masked as `***`' })
  value: string;
}

export class AgentHttpRequestPayloadDto {
  @ApiProperty({ type: () => [AgentHttpHeaderDto] })
  requestHeaders: AgentHttpHeaderDto[];

  @ApiProperty({ type: () => [AgentHttpHeaderDto] })
  responseHeaders: AgentHttpHeaderDto[];

  @ApiProperty({ type: String, nullable: true })
  requestBody: string | null;

  @ApiProperty({ type: String, nullable: true })
  responseBody: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '`base64` for a binary or non-UTF-8 body',
  })
  requestBodyEncoding: string | null;

  @ApiProperty({ type: String, nullable: true })
  responseBodyEncoding: string | null;

  @ApiProperty()
  requestBodyTruncated: boolean;

  @ApiProperty()
  responseBodyTruncated: boolean;

  @ApiProperty({ type: String, nullable: true })
  contentType: string | null;
}

export class AgentHttpRequestDetailDto extends AgentHttpRequestListItemDto {
  @ApiProperty({
    type: () => AgentHttpRequestPayloadDto,
    nullable: true,
    description: 'Null for a CONNECT tunnel with no recorded payload',
  })
  payload: AgentHttpRequestPayloadDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Shell command of the tool call that made the request',
  })
  command: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  messageId: string | null;
}
