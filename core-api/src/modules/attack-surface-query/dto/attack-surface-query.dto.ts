import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const QUERY_EXAMPLE = {
  window: { since: 'now-5d' },
  queries: {
    newDomains: {
      from: 'hosts',
      select: ['value', 'firstSeen', 'target.value'],
      include: { ips: { select: ['ip'], limit: 5 } },
      where: { logic: 'and', items: [{ field: 'kind', op: 'eq', value: 'domain' }] },
      limit: 100,
    },
    newPorts: {
      from: 'services',
      select: ['port', 'host.value', 'http.title', 'firstSeen'],
      limit: 100,
    },
    portSummary: {
      from: 'services',
      groupBy: ['port'],
      aggregate: { hosts: { fn: 'countDistinct', field: 'host.id' } },
      orderBy: [{ field: 'hosts', dir: 'desc' }],
      limit: 20,
    },
  },
};

/**
 * A query batch. Only the outer keys are declared here (the global
 * ValidationPipe whitelists them); the nested structure is validated by the
 * service against the catalog, with error paths the client can act on.
 */
export class QueryBatchDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Named queries: { <name>: { from, select?, include?, where?, window?, windowField?, groupBy?, aggregate?, orderBy?, limit?, cursor?, withTotal? } }. See GET attack-surface/schema.',
    example: QUERY_EXAMPLE.queries,
  })
  @IsObject()
  queries: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Default time window of every query: { since: "now-5d", until?: "now" }',
    example: QUERY_EXAMPLE.window,
  })
  @IsOptional()
  @IsObject()
  window?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: '{ consistent?: boolean, timezone?: "UTC", mode?: "interactive" | "report" }',
  })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

export class QueryResultMetaDto {
  @ApiProperty() now: string;
  @ApiProperty() tookMs: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) queries: Record<string, unknown>;
}

export class QueryBatchResultDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '{ <name>: { rows, nextCursor?, total?, totalCapped?, truncated } | { error: { code, message } } }',
  })
  data: Record<string, unknown>;

  @ApiProperty({ type: QueryResultMetaDto })
  meta: QueryResultMetaDto;
}

export class ReportJobDto {
  @ApiProperty() jobId: string;
  @ApiProperty({ enum: ['queued', 'running', 'completed', 'failed'] }) status: string;
  @ApiPropertyOptional({ type: QueryBatchResultDto }) result?: QueryBatchResultDto;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) error?: Record<string, unknown>;
}

export class ExplainResultDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '{ <name>: { cost, budget, hints, resources, planner: { totalCost, sortRows }, sqlTemplate? } }',
  })
  queries: Record<string, unknown>;
}

export class SchemaFieldDto {
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) ops: string[];
  @ApiPropertyOptional({ type: [String] }) enumValues?: string[];
  @ApiPropertyOptional() sortable?: string;
  @ApiPropertyOptional() groupable?: boolean;
  @ApiPropertyOptional() heavy?: boolean;
}

export class SchemaRelationDto {
  @ApiProperty() name: string;
  @ApiProperty() resource: string;
  @ApiProperty() description: string;
}

export class SchemaResourceDto {
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() root: boolean;
  @ApiProperty({ type: [SchemaFieldDto] }) fields: SchemaFieldDto[];
  @ApiProperty({ type: [SchemaRelationDto] }) one: SchemaRelationDto[];
  @ApiProperty({ type: [SchemaRelationDto] }) many: SchemaRelationDto[];
  @ApiProperty({ type: [String] }) defaultSelect: string[];
  @ApiPropertyOptional() defaultTimeField?: string;
}

export class SchemaResponseDto {
  @ApiProperty({ type: [SchemaResourceDto] }) resources: SchemaResourceDto[];
}

export class CreateSavedQueryDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'A query batch, same shape as the body of POST attack-surface/query',
    example: QUERY_EXAMPLE,
  })
  @IsObject()
  spec: Record<string, unknown>;
}

export class UpdateSavedQueryDto extends PartialType(CreateSavedQueryDto) {}

export class SavedQueryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) spec: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true, type: String }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
