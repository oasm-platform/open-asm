import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetManyIntegrationsDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false, description: 'Filter by app type' })
  @IsOptional()
  @IsString()
  appType?: string;

  @ApiProperty({ required: false, description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;
}
