import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class WorkerManifestResponseDto {
  @ApiProperty({
    description: 'URL to the worker tools archive package',
    example: '/static/archived/tools.tar.gz',
  })
  downloadToolsUrl: string;
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
