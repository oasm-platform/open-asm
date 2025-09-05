import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class RunToolDto {
  @ApiProperty({
    required: false,
    isArray: true,
  })
  @IsUUID(4, { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  targetIds?: string[];
}
