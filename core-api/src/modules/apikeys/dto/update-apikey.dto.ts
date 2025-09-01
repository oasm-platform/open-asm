import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiKeyType } from 'src/common/enums/enum';

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