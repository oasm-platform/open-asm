import { PickType } from '@nestjs/swagger';
import { Template } from '../entities/templates.entity';

export class CreateTemplateDTO extends PickType(Template, [
  'fileName',
] as const) {}
