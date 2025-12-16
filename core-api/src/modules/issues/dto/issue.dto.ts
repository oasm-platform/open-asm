import { IssueSourceType, IssueStatus, Severity } from '@/common/enums/enum';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateIssueDto {
    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ enum: Severity })
    @IsEnum(Severity)
    @IsOptional()
    severity?: Severity;

    @ApiProperty({ enum: IssueSourceType })
    @IsEnum(IssueSourceType)
    @IsOptional()
    sourceType?: IssueSourceType;

    @ApiProperty()
    @IsOptional()
    @IsString()
    sourceId?: string;
}

export class UpdateIssueDto extends PartialType(CreateIssueDto) {
    @ApiProperty({ enum: IssueStatus })
    @IsEnum(IssueStatus)
    @IsOptional()
    status?: IssueStatus;
}
