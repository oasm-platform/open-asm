import { IssueSourceType, IssueStatus } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateIssueDto {
    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    description?: string;



    @ApiProperty({ enum: IssueSourceType })
    @IsEnum(IssueSourceType)
    @IsOptional()
    sourceType?: IssueSourceType;

    @ApiProperty()
    @IsOptional()
    @IsString()
    sourceId?: string;
}

export class UpdateIssueDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    title?: string;
}

export class ChangeIssueStatusDto {
    @ApiProperty({ enum: IssueStatus })
    @IsEnum(IssueStatus)
    status: IssueStatus;
}
