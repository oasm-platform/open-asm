import { ApiProperty } from '@nestjs/swagger';
import { Template } from '../entities/templates.entity';
import { StreamableFile } from '@nestjs/common';

export class GetTemplateResponseDTO extends Template {
  @ApiProperty()
  content: StreamableFile;
}
