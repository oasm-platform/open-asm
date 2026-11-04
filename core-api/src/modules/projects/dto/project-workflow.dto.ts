import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ProjectToolInput } from './create-project.dto';
import { ProjectWorkflowOnDto } from './project-workflow-on.dto';

/**
 * A new project workflow, from exactly one source: a default workflow
 * template, a list of tools, or a copy of another project's workflow.
 */
export class CreateProjectWorkflowDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    required: false,
    description: 'File name of a default workflow to copy the jobs from',
    example: 'vulnerability_scan_basic.yaml',
  })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiProperty({ required: false, type: [ProjectToolInput] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProjectToolInput)
  tools?: ProjectToolInput[];

  @ApiProperty({
    required: false,
    description: 'Project workflow (binding) of any project to copy',
  })
  @IsOptional()
  @IsUUID()
  copyFromProjectWorkflowId?: string;

  @ApiProperty({
    required: false,
    type: () => ProjectWorkflowOnDto,
    description: 'When the workflow runs on its own: schedules and "assets added"',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectWorkflowOnDto)
  on?: ProjectWorkflowOnDto;
}

export class UpdateProjectWorkflowDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    required: false,
    type: [ProjectToolInput],
    description: 'Replaces the pipeline',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProjectToolInput)
  tools?: ProjectToolInput[];

  @ApiProperty({
    required: false,
    type: () => ProjectWorkflowOnDto,
    description: 'Replaces when the workflow runs on its own; omitted = unchanged',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectWorkflowOnDto)
  on?: ProjectWorkflowOnDto;
}

export class RunProjectWorkflowDto {
  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Scan only these assets of the project; omitted = the whole scope',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(5000)
  assetIds?: string[];
}

export class ProjectWorkflowRemovedDto extends DefaultMessageResponseDto {
  @ApiProperty({ description: 'Name of the removed workflow' })
  name: string;
}

export class RunStartedDto {
  @ApiProperty()
  jobHistoryId: string;

  @ApiProperty({ description: 'Assets in the run scope' })
  assets: number;
}

export class WorkflowTemplateJobDto {
  @ApiProperty() id: string;
  @ApiProperty() run: string;
  @ApiProperty({ type: [String] }) needs: string[];
}

export class WorkflowTemplateDto {
  @ApiProperty() filePath: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [WorkflowTemplateJobDto] })
  jobs: WorkflowTemplateJobDto[];
}
