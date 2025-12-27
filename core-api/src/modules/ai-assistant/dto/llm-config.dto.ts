import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateLLMConfigDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  model?: string;
}

export class LLMConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  provider: string;

  @ApiProperty()
  apiKey: string;

  @ApiProperty()
  model?: string;

  @ApiProperty()
  isPreferred: boolean;
}

export class ModelInfoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  provider: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isRecommended: boolean;
}
