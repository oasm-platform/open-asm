import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class MCPServerConfigDto {
  @ApiPropertyOptional({ example: 'http://localhost:3000/sse' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ enum: ['sse', 'streamable-http'], example: 'sse', default: 'sse' })
  @IsOptional()
  @IsIn(['sse', 'streamable-http'])
  transport?: 'sse' | 'streamable-http';

  @ApiPropertyOptional({ example: { 'api-key': 'sk-...' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({ example: ['tool1', 'tool2'], nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_tools?: string[] | null;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  timeout?: number;

  @ApiPropertyOptional({ example: 300, default: 300, description: 'SSE read timeout in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  sse_read_timeout?: number;
}

export class MCPServerResponseDto extends MCPServerConfigDto {
  @ApiProperty({ example: 'my-mcp-server' })
  name: string;
}

export class MCPConfigResponseDto {
  @ApiProperty({ type: [MCPServerResponseDto] })
  servers: MCPServerResponseDto[];
}

export class UpsertMCPServerDto extends MCPServerConfigDto {
  // name comes from URL param
}

export class ToggleMCPServerDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  disabled: boolean;
}

export class MCPServerPingResponseDto {
  @ApiProperty({ enum: ['online', 'offline', 'unknown'], example: 'online' })
  status: 'online' | 'offline' | 'unknown';

  @ApiProperty({ example: 42, required: false, description: 'Latency in ms' })
  latency?: number;
}
