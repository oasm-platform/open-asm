import { PartialType, PickType } from '@nestjs/swagger';
import { Workspace } from '../entities/workspace.entity';

export class CreateWorkspaceDto extends PickType(Workspace, [
  'name',
  'description',
] as const) {}

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {}

export class WorkspaceStatisticsResponseDto {
  totalTargets: number;
  totalAssets: number;
  technologies: string[];
  cnameRecords: string[];
  statusCodes: number[];
}
