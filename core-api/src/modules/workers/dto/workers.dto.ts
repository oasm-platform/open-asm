import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class WorkerManifestResponseDto {
  @ApiProperty({
    description: 'Commands to initialize worker tools',
    example: ['nuclei -ut'],
    type: [String],
  })
  initCommands: string[];
}

export class WorkerMetadataDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  os?: string;
}

export class WorkerJoinDto {
  @ApiProperty()
  @IsString()
  apiKey: string;

  @ApiProperty({ required: false })
  @IsString()
  signature: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiProperty({ required: false, type: () => WorkerMetadataDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkerMetadataDto)
  metadata?: WorkerMetadataDto;
}

export class WorkerAliveDto {
  @ApiProperty()
  @IsString()
  token: string;
}

export class GetManyWorkersDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsUUID('4')
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({ required: false, enum: ['cloud', 'workspace'] })
  @IsString()
  @IsOptional()
  scope?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  enabledAgentMode?: boolean;
}
