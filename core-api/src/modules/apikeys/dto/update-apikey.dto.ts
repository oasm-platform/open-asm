import { ApiKeyType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateApiKeyDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ enum: ApiKeyType })
  @IsEnum(ApiKeyType)
  @IsOptional()
  type?: ApiKeyType;
}