import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ProvidersQueryDto extends GetManyBaseQueryParams {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, example: 'OpenAI' })
  name?: string;
}