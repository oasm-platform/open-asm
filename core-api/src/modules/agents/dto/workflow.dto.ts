import { ApiProperty } from '@nestjs/swagger';
import { SubagentStatus } from '../enums/agent.enums';

export class WorkflowStepDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: ['pending', 'in_progress', 'completed', 'failed'] })
  status: string;

  @ApiProperty()
  sortOrder: number;
}

export class WorkflowFindingDto {
  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  severity: string | null;
}

export class WorkflowNodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Subagent key', example: 'recon' })
  name: string;

  @ApiProperty({ enum: SubagentStatus })
  status: SubagentStatus;

  @ApiProperty({ description: 'Objective of the brief, or the task text' })
  objective: string;

  @ApiProperty({ type: String, nullable: true, description: 'Plan step it serves' })
  stepId: string | null;

  @ApiProperty({ type: [String], description: 'Subagents whose results it needs' })
  after: string[];

  @ApiProperty({ type: [String], description: 'Of `after`, the ones still active' })
  waitingOn: string[];

  @ApiProperty({
    type: [String],
    description: 'Earlier subagents whose results led to it',
  })
  derivedFrom: string[];

  @ApiProperty({ type: String, nullable: true, description: 'Subagent it follows up' })
  continuesFrom: string | null;

  @ApiProperty({ enum: ['done', 'partial', 'blocked'], nullable: true })
  outcome: string | null;

  @ApiProperty({ type: String, nullable: true })
  summary: string | null;

  @ApiProperty({ type: [WorkflowFindingDto] })
  findings: WorkflowFindingDto[];

  @ApiProperty({ type: String, nullable: true })
  error: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  completedAt: Date | null;
}

export class WorkflowNoteDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['fact', 'decision', 'issue'] })
  kind: string;

  @ApiProperty({ type: String, nullable: true })
  key: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({ description: 'Subagent name, or `main`' })
  author: string;

  @ApiProperty({ type: String, nullable: true })
  subagentId: string | null;

  @ApiProperty({ type: String, nullable: true })
  stepId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class WorkflowResponseDto {
  @ApiProperty({ type: String, nullable: true })
  goal: string | null;

  @ApiProperty({ type: [WorkflowStepDto] })
  steps: WorkflowStepDto[];

  @ApiProperty({ type: [WorkflowNodeDto] })
  nodes: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowNoteDto] })
  notes: WorkflowNoteDto[];
}
