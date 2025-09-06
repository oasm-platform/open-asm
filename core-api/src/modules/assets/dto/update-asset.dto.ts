import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class UpdateAssetDto {
  @ApiProperty({ type: [String], nullable: true, default: [] })
  @IsArray()
  tags: string[];
}
