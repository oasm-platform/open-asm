import { PickType } from '@nestjs/swagger';
import { Tool } from '../entities/tools.entity';

export class CreateToolDto extends PickType(Tool, [
  'name',
  'description',
  'category',
  'logoUrl',
  'version',
] as const) {}
