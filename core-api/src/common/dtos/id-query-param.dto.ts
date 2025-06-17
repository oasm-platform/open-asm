import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IdQueryParamDto {
  @ApiProperty({ description: 'The id of the resource' })
  @IsUUID('4')
  id: string;
}
