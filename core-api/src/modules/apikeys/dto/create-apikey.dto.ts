import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiKeyType } from 'src/common/enums/enum';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ApiKeyType })
  @IsEnum(ApiKeyType)
  type: ApiKeyType;
}