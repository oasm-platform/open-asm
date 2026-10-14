import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LLMProvider } from '../enums/agent.enums';

const LOCAL_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

export class LLMProviderSupportedDto {
  @ApiProperty({
    description: 'Stable provider identifier',
    enum: LLMProvider,
    example: LLMProvider.OPENAI,
  })
  @IsEnum(LLMProvider)
  id: LLMProvider;

  @ApiProperty({
    description: 'Human-readable provider name',
    example: 'OpenAI',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Path or URL of the provider logo',
    example: '/images/llm/openai.svg',
  })
  @IsString()
  logo: string;

  @ApiPropertyOptional({
    description: 'Whether the provider accepts a custom API base URL',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isAcceptCustomApiUrl?: boolean;
}

export class LLMProviderStatusDto {
  @ApiProperty({
    description: 'Stable provider identifier',
    enum: LLMProvider,
    example: LLMProvider.OPENAI,
  })
  @IsEnum(LLMProvider)
  id: LLMProvider;

  @ApiProperty({
    description: 'Human-readable provider name',
    example: 'OpenAI',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Path or URL of the provider logo',
    example: '/images/llm/openai.svg',
  })
  @IsString()
  logo: string;

  @ApiProperty({
    description: 'Whether the user has configured this provider',
    example: true,
  })
  @IsBoolean()
  isConnected: boolean;

  @ApiProperty({
    description: 'Active provider configuration, or null when disconnected',
    nullable: true,
    type: () => LLMConfigResponseDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LLMConfigResponseDto)
  config: LLMConfigResponseDto | null;
}

export class CreateLLMConfigDto {
  @ApiProperty({
    description: 'Provider to configure',
    enum: LLMProvider,
    example: LLMProvider.OPENROUTER,
  })
  @IsEnum(LLMProvider)
  provider: LLMProvider;

  @ApiPropertyOptional({
    description: 'User-defined label for the configuration',
    example: 'Production OpenAI key',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description: 'Provider API key used to authenticate model requests',
    example: 'sk-...',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiPropertyOptional({
    description: 'Default model identifier; the first available model is used when omitted',
    example: 'gpt-5',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  model?: string;

  @ApiPropertyOptional({
    description: 'Custom provider API base URL',
    example: 'https://api.example.com/v1',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl(LOCAL_URL_OPTIONS)
  @MaxLength(500)
  apiUrl?: string;

  @ApiPropertyOptional({
    description: 'Custom context window size in tokens',
    example: 8192,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contextWindow?: number;
}

export class UpdateLLMConfigDto extends PartialType(CreateLLMConfigDto) {
  @ApiPropertyOptional({
    description: 'Whether this is the preferred configuration for new conversations',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}

export class LLMConfigResponseDto {
  @ApiProperty({
    description: 'Unique LLM configuration identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Configured provider identifier',
    enum: LLMProvider,
    example: LLMProvider.OPENAI,
  })
  @IsEnum(LLMProvider)
  provider: LLMProvider;

  @ApiPropertyOptional({
    description: 'User-defined label for the configuration',
    example: 'Production OpenAI key',
    maxLength: 255,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;

  @ApiProperty({
    description: 'Default model identifier',
    example: 'gpt-5',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  model: string;

  @ApiPropertyOptional({
    description: 'Custom provider API base URL',
    example: 'https://api.example.com/v1',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsUrl(LOCAL_URL_OPTIONS)
  @MaxLength(500)
  apiUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Custom context window size in tokens',
    example: 8192,
    minimum: 1,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  contextWindow?: number | null;

  @ApiProperty({
    description: 'Whether this is the preferred configuration',
    example: true,
  })
  @IsBoolean()
  isPreferred: boolean;

  @ApiProperty({
    description: 'Masked API key showing only its final characters',
    example: '********abcd',
  })
  @IsString()
  apiKeyMasked: string;

  @ApiProperty({
    description: 'Timestamp when the configuration was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the configuration was last updated',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  updatedAt: Date;
}

export class ProviderModelDto {
  @ApiProperty({
    description: 'Model identifier used for provider API calls',
    example: 'gpt-5',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Human-readable model name',
    example: 'GPT-5',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class LLMConfigWithProviderDto {
  @ApiProperty({
    description: 'Stable provider identifier',
    enum: LLMProvider,
    example: LLMProvider.OPENAI,
  })
  @IsEnum(LLMProvider)
  providerId: LLMProvider;

  @ApiProperty({
    description: 'Human-readable provider name',
    example: 'OpenAI',
  })
  @IsString()
  providerName: string;

  @ApiPropertyOptional({
    description: 'Path or URL of the provider logo',
    example: '/images/llm/openai.svg',
  })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({
    description: 'Whether the user has configured this provider',
    example: true,
  })
  @IsBoolean()
  isConnected: boolean;

  @ApiPropertyOptional({
    description: 'Whether the provider accepts a custom API base URL',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isAcceptCustomApiUrl?: boolean;

  @ApiPropertyOptional({
    description: 'LLM configuration identifier when connected',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  configId?: string;

  @ApiPropertyOptional({
    description: 'User-defined configuration label',
    example: 'Production OpenAI key',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Configured model identifier',
    example: 'gpt-5',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Configured custom API base URL',
    example: 'https://api.example.com/v1',
  })
  @IsOptional()
  @IsUrl(LOCAL_URL_OPTIONS)
  apiUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether this is the preferred configuration',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional({
    description: 'Masked provider API key',
    example: '********abcd',
  })
  @IsOptional()
  @IsString()
  apiKeyMasked?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the configuration was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @ApiPropertyOptional({
    description: 'Timestamp when the configuration was last updated',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDate()
  updatedAt?: Date;
}
