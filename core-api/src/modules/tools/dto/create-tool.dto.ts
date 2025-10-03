import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { Tool } from '../entities/tools.entity';

export class CreateToolDto extends PickType(Tool, [
  'name',
  'description',
  'category',
  'logoUrl',
  'version',
] as const) {
  @ApiProperty({
    description: 'The ID of the provider',
  })
  @IsUUID(7)
  @IsOptional()
  providerId: string;
}
