import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RunTemplateDto {
    @ApiProperty({ required: true })
    @IsUUID(7)
    templateId: string;

    @ApiProperty({ required: true })
    @IsUUID(7)
    assetId: string;
}
