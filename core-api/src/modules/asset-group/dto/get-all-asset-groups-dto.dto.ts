import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID, IsOptional } from 'class-validator';

export class GetAllAssetGroupsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({
    required: false,
    isArray: true,
  })
  @IsUUID('all', { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  targetIds?: string[];
}
