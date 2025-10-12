import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ProvidersQueryDto extends GetManyBaseQueryParams {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'OpenAI' })
  name?: string;
}