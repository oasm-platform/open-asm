import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateBy,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';

const LOCAL_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

function IsStringRecord(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStringRecord',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value).every((item) => typeof item === 'string'),
        defaultMessage: () => 'headers must contain only string values',
      },
    },
    validationOptions,
  );
}

export class MCPServerConfigDto {
  @ApiPropertyOptional({
    description: 'HTTP endpoint exposed by the MCP server',
    example: 'http://localhost:3000/sse',
  })
  @IsOptional()
  @IsUrl(LOCAL_URL_OPTIONS)
  url?: string;

  @ApiPropertyOptional({
    description: 'Transport protocol used to connect to the MCP server',
    enum: ['sse', 'streamable-http'],
    example: 'sse',
    default: 'sse',
  })
  @IsOptional()
  @IsIn(['sse', 'streamable-http'])
  transport?: 'sse' | 'streamable-http';

  @ApiPropertyOptional({
    description: 'HTTP headers included with MCP server requests',
    example: { 'x-oasm-api-key': 'sk-...' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  @IsStringRecord()
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Whether this MCP server is disabled',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({
    description: 'Allowlist of exposed tool names; null allows every tool',
    example: ['tool1', 'tool2'],
    nullable: true,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_tools?: string[] | null;

  @ApiPropertyOptional({
    description: 'Connection and request timeout in seconds',
    example: 60,
    default: 60,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  timeout?: number;

  @ApiPropertyOptional({
    description: 'Maximum time to wait for an SSE event in seconds',
    example: 300,
    default: 300,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sse_read_timeout?: number;
}

export class MCPServerResponseDto extends MCPServerConfigDto {
  @ApiProperty({
    description: 'Unique configured name of the MCP server',
    example: 'my-mcp-server',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class MCPConfigResponseDto {
  @ApiProperty({
    description: 'Configured MCP servers in the current workspace',
    type: [MCPServerResponseDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MCPServerResponseDto)
  servers: MCPServerResponseDto[];
}

export class UpsertMCPServerDto extends MCPServerConfigDto {
  // name comes from URL param
}

export class ToggleMCPServerDto {
  @ApiProperty({
    description: 'Whether the MCP server should be disabled',
    example: true,
  })
  @IsBoolean()
  disabled: boolean;
}

export class MCPServerPingResponseDto {
  @ApiProperty({
    description: 'Observed connectivity state of the MCP server',
    enum: ['online', 'offline', 'unknown'],
    example: 'online',
  })
  @IsIn(['online', 'offline', 'unknown'])
  status: 'online' | 'offline' | 'unknown';

  @ApiPropertyOptional({
    description: 'Round-trip latency in milliseconds when measured',
    example: 42,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  latency?: number;
}
