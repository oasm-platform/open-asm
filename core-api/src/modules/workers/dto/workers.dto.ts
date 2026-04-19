import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkerManifestResponseDto {
  @ApiProperty({
    description: 'URL to the worker tools archive package',
    example: '/static/archived/tools.tar.gz',
  })
  downloadToolsUrl: string;
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
}
