import { PickType } from '@nestjs/swagger';
import { Tool } from 'src/modules/tools/entities/tools.entity';

export class BuiltInTool extends PickType(Tool, [
  'category',
  'description',
  'command',
  'resultHandler',
]) {}
