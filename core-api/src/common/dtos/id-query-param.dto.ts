import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IdQueryParamDto {
  @ApiProperty({ description: 'The id of the resource' })
  @IsUUID(7)
  id: string;
}
