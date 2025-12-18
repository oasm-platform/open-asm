import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class CreateFirstAdminDto {
  @ApiProperty()
  @IsEmail()
  email: string;
  @IsString()
  @ApiProperty()
  password: string;
}

export class GetMetadataDto {
  @ApiProperty()
  isInit: boolean;
  @ApiProperty()
  isAssistant: boolean;
}
