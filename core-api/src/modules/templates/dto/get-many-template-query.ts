import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';

export class GetManyTemplatesQueryDTO extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  value?: string;
}
