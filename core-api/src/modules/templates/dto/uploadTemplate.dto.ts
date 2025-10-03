import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class UploadTemplateDTO {
  @ApiProperty()
  @IsUUID(7)
  templateId: string;
  @ApiProperty()
  @IsString()
  fileContent: string;
}

export class UploadTemplateResponseDTO {
  @ApiProperty()
  path: string;
}
