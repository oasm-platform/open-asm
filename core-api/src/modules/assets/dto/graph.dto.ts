/**
 * Asset Topology Graph DTOs
 *
 * Composite ID scheme
 * -------------------
 * Every node in the graph carries a deterministic ID built from a type prefix and
 * a natural key, joined by the pipe character `|`.  The pipe is safe because it
 * never appears in any of the key components (UUIDs, IPv4/IPv6 addresses,
 * hostnames, technology names, or port numbers).
 *
 * | Prefix        | Key             | Example                    |
 * |---------------|-----------------|----------------------------|
 * | target        | UUID            | target\|a1b2c3d4-...       |
 * | asset         | UUID            | asset\|e5f6a7b8-...        |
 * | ip            | IP address      | ip\|203.0.113.42           |
 * | service       | asset service ID| service\|c9d0e1f2-...      |
 * | tech          | base name       | tech\|nginx                |
 * | tls           | hostname        | tls\|example.com           |
 * | statusCode    | HTTP code       | statusCode\|404            |
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

// ---------------------------------------------------------------------------
// Query DTO
// ---------------------------------------------------------------------------

export class GetAssetGraphQueryDto {
  @ApiProperty({
    required: false,
    description:
      'When provided the response is scoped to this target and its direct neighbours.',
  })
  @IsOptional()
  @IsUUID()
  targetId?: string;
}

// ---------------------------------------------------------------------------
// Node & Edge DTOs
// ---------------------------------------------------------------------------

export class GraphNodeDto {
  @ApiProperty({
    description: 'Composite node ID (type|key). See module doc comment.',
  })
  id: string;

  @ApiProperty({
    enum: [
      'target',
      'asset',
      'ip',
      'service',
      'technology',
      'tls',
      'statusCode',
    ],
    description: 'Determines which group the node belongs to.',
  })
  type: string;

  @ApiProperty({
    description: 'Human-readable label rendered on the node.',
  })
  data: {
    label: string;
    metadata?: Record<string, unknown>;
  };
}

export class GraphEdgeDto {
  @ApiProperty({
    description: 'Composite edge ID.',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the source node.',
  })
  source: string;

  @ApiProperty({
    description: 'ID of the target node.',
  })
  target: string;

  @ApiProperty({ required: false, description: 'Edge type.' })
  type?: string;

  @ApiProperty({ required: false, description: 'Optional label for the edge.' })
  label?: string;
}

// ---------------------------------------------------------------------------
// Response DTO
// ---------------------------------------------------------------------------

export class AssetGraphResponseDto {
  @ApiProperty({ type: () => [GraphNodeDto] })
  nodes: GraphNodeDto[];

  @ApiProperty({ type: () => [GraphEdgeDto] })
  edges: GraphEdgeDto[];
}
