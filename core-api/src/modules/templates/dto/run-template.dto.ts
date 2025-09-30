import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RunTemplateDto {
    @ApiProperty({ required: true })
    @IsUUID()
    templateId: string;

    @ApiProperty({ required: true })
    @IsUUID()
    assetId: string;
}
