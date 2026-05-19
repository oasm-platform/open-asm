import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { EmbeddingProvider } from '../enums/agent.enums';

export class EmbeddingModelInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  dimensions: number;
}

export class CreateEmbeddingConfigDto {
  @ApiProperty({ enum: EmbeddingProvider, example: EmbeddingProvider.OPENAI })
  @IsEnum(EmbeddingProvider)
  provider: EmbeddingProvider;

  @ApiProperty({ required: false, example: 'My OpenAI embeddings' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  apiKey: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  model: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiUrl?: string;
}

export class UpdateEmbeddingConfigDto extends PartialType(
  CreateEmbeddingConfigDto,
) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}

export class EmbeddingConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: EmbeddingProvider })
  provider: EmbeddingProvider;

  @ApiProperty({ required: false })
  name?: string;

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

export class EmbeddingProviderStatusDto {
  @ApiProperty({ enum: EmbeddingProvider })
  id: EmbeddingProvider;

  @ApiProperty()
  name: string;

  @ApiProperty()
  logo: string;

  @ApiProperty()
  isConnected: boolean;

  @ApiProperty({ type: () => [EmbeddingModelInfoDto] })
  models: EmbeddingModelInfoDto[];

  @ApiProperty({ required: false })
  isAcceptCustomApiUrl?: boolean;

  @ApiProperty({ type: () => EmbeddingConfigResponseDto, nullable: true })
  config: EmbeddingConfigResponseDto | null;
}
