import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class RunToolDto {
  @ApiProperty({
    type: String,
    isArray: true,
    required: false,
  })
  @IsUUID(7, { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  targetIds?: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    required: false,
  })
  @IsUUID(7, { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  assetIds?: string[];
}
