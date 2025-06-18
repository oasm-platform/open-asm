import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, Not, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceTarget } from './entities/workspace-target.entity';
import { Target } from './entities/target.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateTargetDto } from './dto/targets.dto';
import { UserContextPayload } from 'src/common/interfaces/app.interface';

@Injectable()
export class TargetsService {
  constructor(
    @InjectRepository(Target)
    private readonly repo: Repository<Target>,
    @InjectRepository(WorkspaceTarget)
    private readonly workspaceTargetRepository: Repository<WorkspaceTarget>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Retrieves a target entity by its value.
   *
   * @param value - The unique value of the target to retrieve.
   * @returns A promise that resolves to the target entity if found, otherwise null.
   */
  private async getTargetByValue(value: string): Promise<Target | null> {
    return this.repo.findOneBy({ value });
  }

  /**
   * Creates a target and associates it with a workspace.
   * If the target does not exist, it will be created.
   * Only the owner of the workspace can create a target.
   *
   * @param dto - The data transfer object containing target details.
   * @param userContext - The user's context data, which includes the user's ID.
   * @throws NotFoundException if the workspace does not exist.
   * @throws BadRequestException if the user is not the owner of the workspace.
   * @returns A response indicating the target was successfully created.
   */
  public async createTarget(
    dto: CreateTargetDto,
    userContext: UserContextPayload,
  ) {
    const { id } = userContext;
    const { workspaceId, value, isReScan } = dto;

    // Check if the workspace exists
    const workspace = await this.workspacesService.getWorkspaceById(
      workspaceId,
      userContext,
    );

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Check if the user is the owner of the workspace
    if (workspace.owner.id !== id) {
      throw new BadRequestException('You are not the owner of this workspace');
    }

    let target = await this.getTargetByValue(value);

    if (!target) {
      target = await this.repo.save({ value, isReScan });
    }

    await this.workspaceTargetRepository.save({
      workspace,
      target,
    });

    return { message: 'Target created successfully' };
  }
}
