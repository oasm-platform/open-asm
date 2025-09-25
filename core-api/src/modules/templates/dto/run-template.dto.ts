import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { RunToolDto } from 'src/modules/tools/dto/run-tool.dto';

export class RunTemplateDto extends RunToolDto {
    @ApiProperty({ required: true })
    @IsUUID()
    templateId: string;
}
