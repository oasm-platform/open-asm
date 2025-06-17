import { PartialType } from '@nestjs/swagger';
import { Workspace } from '../entities/workspace.entity';

export class CreateWorkspaceDto extends PartialType(Workspace) {}

export class UpdateWorkspaceDto extends PartialType(Workspace) {}
