import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsArray,
  IsOptional,
  Matches,
  ArrayMaxSize,
} from 'class-validator';
import { Job } from 'src/modules/jobs-registry/entities/job.entity';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';

export class GetAssetsResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  targetId: string;
  @ApiProperty({ required: false })
  isPrimary?: boolean;
  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt: Date;
  @ApiProperty({ required: false })
  dnsRecords?: object;

  @ApiProperty({ type: Job, required: false })
  workerResults: Record<string, any>;
}

export class GetAssetsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty()
  @IsUUID()
  workspaceId: string;

  @ApiProperty({
    required: false,
  })
  @IsArray()
  @IsUUID(4, { each: true })
  @IsOptional()
  targetId?: string[];

  @ApiProperty({
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  port?: string[];

  @ApiProperty({
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tech?: string[];

  @ApiProperty({
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  statusCode?: string[];
}
