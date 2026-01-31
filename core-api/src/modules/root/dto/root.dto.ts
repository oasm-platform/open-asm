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

  @ApiProperty({ description: 'System name' })
  name: string;

  @ApiProperty({
    description: 'Path to system logo',
    type: String,
    nullable: true,
  })
  logoPath?: string | null;
}
