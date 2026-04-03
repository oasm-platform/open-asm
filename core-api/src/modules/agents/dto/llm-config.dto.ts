import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { LLMProvider } from '../enums/agent.enums';

export class LLMProviderSupportedDto {
  @ApiProperty({ enum: LLMProvider, description: 'Provider identifier' })
  id: LLMProvider;

  @ApiProperty({ description: 'Provider display name' })
  name: string;

  @ApiProperty({ description: 'Provider logo path' })
  logo: string;
}

export class LLMProviderStatusDto {
  @ApiProperty({ enum: LLMProvider, description: 'Provider identifier' })
  id: LLMProvider;

  @ApiProperty({ description: 'Provider display name' })
  name: string;

  @ApiProperty({ description: 'Provider logo path' })
  logo: string;

  @ApiProperty({ description: 'Whether provider has a configured LLM config' })
  isConnected: boolean;

  @ApiProperty({
    description: 'LLM config if connected, null otherwise',
    nullable: true,
    type: () => LLMConfigResponseDto,
  })
  config: LLMConfigResponseDto | null;
}

export class CreateLLMConfigDto {
  @ApiProperty({ enum: LLMProvider, example: LLMProvider.OPENROUTER })
  @IsEnum(LLMProvider)
  provider: LLMProvider;

  @ApiProperty({})
  @IsString()
  apiKey: string;

  @ApiProperty({})
  @IsString()
  model: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiUrl?: string;
}

export class UpdateLLMConfigDto extends PartialType(CreateLLMConfigDto) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}

export class LLMConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: LLMProvider })
  provider: LLMProvider;

  @ApiProperty()
  model: string;

  @ApiProperty({ required: false })
  apiUrl?: string;

  @ApiProperty()
  isPreferred: boolean;

  @ApiProperty({ description: 'Masked API key (shows last 4 chars)' })
  apiKeyMasked: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ProviderModelDto {
  @ApiProperty({ description: 'Model identifier for API calls' })
  id: string;

  @ApiProperty({ description: 'Human-readable model name' })
  name: string;
}

export class LLMConfigWithProviderDto {
  @ApiProperty({ enum: LLMProvider, description: 'Provider identifier' })
  providerId: LLMProvider;

  @ApiProperty({ description: 'Provider display name' })
  providerName: string;

  @ApiProperty({ description: 'Provider logo path', required: false })
  logo?: string;

  @ApiProperty({ description: 'Connection status' })
  isConnected: boolean;

  @ApiProperty({ description: 'LLM config ID if connected', required: false })
  configId?: string;

  @ApiProperty({ description: 'Model name if connected', required: false })
  model?: string;

  @ApiProperty({ description: 'API URL if connected', required: false })
  apiUrl?: string;

  @ApiProperty({
    description: 'Is preferred config if connected',
    required: false,
  })
  isPreferred?: boolean;

  @ApiProperty({ description: 'Masked API key if connected', required: false })
  apiKeyMasked?: string;

  @ApiProperty({ description: 'Created at if connected', required: false })
  createdAt?: Date;

  @ApiProperty({ description: 'Updated at if connected', required: false })
  updatedAt?: Date;
}
