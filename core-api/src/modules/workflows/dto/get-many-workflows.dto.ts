import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Query parameters for getting many workflows
 */
export class GetManyWorkflowsQueryDto extends GetManyBaseQueryParams {
    @ApiProperty({ required: false, description: 'Filter by workflow name' })
    @IsString()
    @IsOptional()
    name?: string;
}

/**
 * Response DTO for a single workflow in the list
 */
export class GetManyWorkflowsResponseDto {
    @ApiProperty({ description: 'The unique identifier of the workflow' })
    @IsUUID('4')
    id: string;

    @ApiProperty({ description: 'The name of the workflow' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'The file path of the workflow' })
    @IsString()
    filePath: string;

    @ApiProperty({ description: 'The workflow content' })
    content: Record<string, unknown>;

    @ApiProperty({ description: 'When the workflow was created' })
    createdAt: Date;

    @ApiProperty({ description: 'When the workflow was last updated' })
    updatedAt: Date;

    @ApiProperty({ description: 'The user who created this workflow', required: false })
    createdBy?: {
        id: string;
        email: string;
    };

    @ApiProperty({ description: 'The workspace this workflow belongs to', required: false })
    workspace?: {
        id: string;
        name: string;
    };
}
