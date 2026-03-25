import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { LLMProvider } from '../enums/agent.enums';

export class LLMProviderSupportedDto {
  @ApiProperty({ enum: LLMProvider, description: 'Provider identifier' })
  id: LLMProvider;

  @ApiProperty({ description: 'Provider display name' })
  name: string;
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
