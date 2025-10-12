import { ApiKeyType } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ApiKeyType })
  @IsEnum(ApiKeyType)
  type: ApiKeyType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ref: string;
}
