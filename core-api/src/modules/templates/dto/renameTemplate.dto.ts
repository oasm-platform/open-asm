import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RenameTemplateDTO {
  @ApiProperty()
  @IsString()
  fileName: string;
}
