import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ScanDto {
  @ApiProperty({
    required: true,
    type: [String],
    description: 'IDs of the targets to scan',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  targetIds: string[];
}
