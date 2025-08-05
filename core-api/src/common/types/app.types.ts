import { PickType } from '@nestjs/swagger';
import { Tool } from 'src/modules/tools/entities/tools.entity';

export class BuiltInTool extends PickType(Tool, [
  'name',
  'category',
  'description',
  'command',
  'resultHandler',
  'version',
  'logoUrl',
]) {}
