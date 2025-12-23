import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { WorkflowContent } from '../entities/workflow.entity';

export class CreateWorkflowDto {
  @ApiProperty({
    description: 'Name of the workflow',
    example: 'Group Workflow',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Content of the workflow in JSON format',
  })
  @IsObject()
  @IsNotEmpty()
  content: WorkflowContent;

  @ApiProperty({
    description: 'File path for the workflow',
    example: 'workflows/vulnerability-scan.yaml',
    required: false,
  })
  @IsString()
  @IsOptional()
  filePath?: string;
}
