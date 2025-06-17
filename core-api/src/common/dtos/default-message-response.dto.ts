import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DefaultMessageResponseDto {
  @ApiProperty({ example: 'Success' })
  @IsString()
  message: string = 'Success';
}
