import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class ScanDto {
  @ApiProperty({ required: true, description: 'Target ID' })
  @IsNotEmpty()
  @IsUUID('4')
  targetId: string;
}
