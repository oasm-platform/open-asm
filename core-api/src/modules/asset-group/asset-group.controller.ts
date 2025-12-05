import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { WorkspaceOwnerGuard } from '@/common/guards/workspace-owner.guard';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Asset } from '../assets/entities/assets.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { AssetGroupService } from './asset-group.service';
import { AddManyAssetsToAssetGroupDto } from './dto/add-many-assets-to-asset-group.dto';
import { AddManyWorkflowsToAssetGroupDto } from './dto/add-many-workflows-to-asset-group.dto';
import { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { GetAllAssetGroupsQueryDto } from './dto/get-all-asset-groups-dto.dto';
import { RemoveManyAssetsFromAssetGroupDto } from './dto/remove-many-assets-from-asset-group.dto';
import { RemoveManyWorkflowsFromAssetGroupDto } from './dto/remove-many-workflows-from-asset-group.dto';
import { UpdateAssetGroupWorkflowDto } from './dto/update-asset-group-workflow.dto';
import { AssetGroupWorkflow } from './entities/asset-groups-workflows.entity';
import { AssetGroup } from './entities/asset-groups.entity';

@ApiTags('Asset Group')
@Controller('asset-group')
export class AssetGroupController {
  constructor(private readonly assetGroupService: AssetGroupService) {}

  @Doc({
    summary: 'Get all asset groups',
    description:
      'Retrieves all asset groups with optional filtering and pagination.',
    response: {
      serialization: GetManyResponseDto(AssetGroup),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getAll(
    @Query() query: GetAllAssetGroupsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getAll(query, workspaceId);
  }

  @Doc({
    summary: 'Get asset group by ID',
    description: 'Fetches a specific asset group by its unique identifier.',
    response: {
      serialization: AssetGroup,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':id')
  getById(@Param('id') id: string, @WorkspaceId() workspaceId: string) {
    return this.assetGroupService.getAssetGroupById(id, workspaceId);
  }

  @Doc({
    summary: 'Create asset group',
    description: 'Creates a new asset group.',
    response: {
      serialization: AssetGroup,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Post()
  create(
    @Body() createAssetGroupDto: CreateAssetGroupDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.create(createAssetGroupDto, workspaceId);
  }

  @Doc({
    summary: 'Add multiple workflows to asset group',
    description:
      'Associates multiple workflows with the specified asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':groupId/workflows')
  addManyWorkflows(
    @Param('groupId') groupId: string,
    @Body() addManyWorkflowsDto: AddManyWorkflowsToAssetGroupDto,
  ) {
    return this.assetGroupService.addManyWorkflows(
      groupId,
      addManyWorkflowsDto.workflowIds,
    );
  }

  @Doc({
    summary: 'Add multiple assets to asset group',
    description: 'Associates multiple assets with the specified asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':groupId/assets')
  addManyAssets(
    @Param('groupId') groupId: string,
    @Body() addManyAssetsDto: AddManyAssetsToAssetGroupDto,
  ) {
    return this.assetGroupService.addManyAssets(
      groupId,
      addManyAssetsDto.assetIds,
    );
  }

  @Doc({
    summary: 'Remove multiple workflows from asset group',
    description: 'Disassociates multiple workflows from the asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':groupId/workflows')
  removeManyWorkflows(
    @Param('groupId') groupId: string,
    @Body() removeManyWorkflowsDto: RemoveManyWorkflowsFromAssetGroupDto,
  ) {
    return this.assetGroupService.removeManyWorkflows(
      groupId,
      removeManyWorkflowsDto.workflowIds,
    );
  }

  @Doc({
    summary: 'Remove multiple assets from asset group',
    description: 'Disassociates multiple assets from the asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':groupId/assets')
  removeManyAssets(
    @Param('groupId') groupId: string,
    @Body() removeManyAssetsDto: RemoveManyAssetsFromAssetGroupDto,
  ) {
    return this.assetGroupService.removeManyAssets(
      groupId,
      removeManyAssetsDto.assetIds,
    );
  }

  @Doc({
    summary: 'Delete asset group',
    description: 'Permanently removes an asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.assetGroupService.delete(id);
  }

  @Doc({
    summary: 'Get assets by asset group ID',
    description:
      'Retrieves assets associated with a specific asset group with pagination.',
    response: {
      serialization: GetManyResponseDto(Asset),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':assetGroupId/assets')
  getAssetsByAssetGroupsId(
    @Param('assetGroupId') assetGroupId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getAssetsByAssetGroupsId(
      assetGroupId,
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Get workflows by asset group ID',
    description:
      'Retrieves workflows associated with a specific asset group with pagination.',
    response: {
      serialization: GetManyResponseDto(AssetGroupWorkflow),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':assetGroupId/workflows')
  getWorkflowsByAssetGroupsId(
    @Param('assetGroupId') assetGroupId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getWorkflowsByAssetGroupsId(
      assetGroupId,
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Get assets not in asset group',
    description:
      'Retrieves assets not associated with a specific asset group with pagination.',
    response: {
      serialization: GetManyResponseDto(Asset),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':assetGroupId/assets/not-in-group')
  getAssetsNotInAssetGroup(
    @Param('assetGroupId') assetGroupId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getAssetsNotInAssetGroup(
      assetGroupId,
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Get workflows not in asset group (preinstalled in workspace)',
    description:
      'Retrieves workflows not associated with a specific asset group but preinstalled in the workspace with pagination.',
    response: {
      serialization: GetManyResponseDto(Workflow),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':assetGroupId/workflows/not-in-group')
  getWorkflowsNotInAssetGroup(
    @Param('assetGroupId') assetGroupId: string,
    @Query() query: GetManyBaseQueryParams,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getWorkflowsNotInAssetGroup(
      assetGroupId,
      query,
      workspaceId,
    );
  }

  @Doc({
    summary: 'Update asset group workflow relationship',
    description:
      'Updates the relationship between an asset group and workflow, primarily to change the schedule.',
    response: {
      serialization: AssetGroupWorkflow,
    },
  })
  @Patch('workflows/:id')
  updateAssetGroupWorkflow(
    @Param('id') assetGroupWorkflowId: string,
    @Body() updateDto: UpdateAssetGroupWorkflowDto,
  ) {
    return this.assetGroupService.updateAssetGroupWorkflow(
      assetGroupWorkflowId,
      {
        schedule: updateDto.schedule,
      },
    );
  }

  @Doc({
    summary: 'Runs the scheduler for a specific asset group workflow.',
    description: 'Runs the scheduler for a specific asset group workflow.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @UseGuards(WorkspaceOwnerGuard)
  @Post('workflows/:id/run')
  runGroupWorkflowScheduler(@Param() queryParams: IdQueryParamDto) {
    return this.assetGroupService.runGroupWorkflowScheduler(queryParams.id);
  }
}
