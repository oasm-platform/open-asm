import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetManyTemplatesQueryDTO extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  value?: string;
}
