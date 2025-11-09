import { WorkspaceId } from '@/common/decorators/workspace-id.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { DefaultMessageResponseDto } from '@/common/dtos/default-message-response.dto';
import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { GetManyResponseDto } from '@/utils/getManyResponse';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AssetGroupService } from './asset-group.service';
import { AddManyAssetsToAssetGroupDto } from './dto/add-many-assets-to-asset-group.dto';
import { AddManyToolsToAssetGroupDto } from './dto/add-many-tools-to-asset-group.dto';
import { AssetGroupResponseDto } from './dto/asset-group-response.dto';
import { CreateAssetGroupDto } from './dto/create-asset-group.dto';
import { RemoveManyAssetsFromAssetGroupDto } from './dto/remove-many-assets-from-asset-group.dto';
import { RemoveManyToolsFromAssetGroupDto } from './dto/remove-many-tools-from-asset-group.dto';

@ApiTags('Asset Group')
@Controller('asset-group')
export class AssetGroupController {
  constructor(private readonly assetGroupService: AssetGroupService) {}

  @Doc({
    summary: 'Get all asset groups',
    description:
      'Retrieves all asset groups with optional filtering and pagination.',
    response: {
      serialization: GetManyResponseDto(AssetGroupResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getAll(
    @Query() query: GetManyBaseQueryParams & { targetId?: string },
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetGroupService.getAll(query, workspaceId);
  }

  @Doc({
    summary: 'Get asset group by ID',
    description: 'Fetches a specific asset group by its unique identifier.',
    response: {
      serialization: AssetGroupResponseDto,
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get(':id')
  getById(@Param('id') id: string, @WorkspaceId() workspaceId: string) {
    return this.assetGroupService.getById(id, workspaceId);
  }

  @Doc({
    summary: 'Create asset group',
    description: 'Creates a new asset group.',
    response: {
      serialization: AssetGroupResponseDto,
    },
  })
  @Post()
  create(@Body() createAssetGroupDto: CreateAssetGroupDto) {
    return this.assetGroupService.create(createAssetGroupDto);
  }

  @Doc({
    summary: 'Add multiple tools to asset group',
    description: 'Associates multiple tools with the specified asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post(':groupId/tools')
  addManyTools(
    @Param('groupId') groupId: string,
    @Body() addManyToolsDto: AddManyToolsToAssetGroupDto,
  ) {
    return this.assetGroupService.addManyTools(
      groupId,
      addManyToolsDto.toolIds,
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
    summary: 'Remove multiple tools from asset group',
    description: 'Disassociates multiple tools from the asset group.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Delete(':groupId/tools')
  removeManyTools(
    @Param('groupId') groupId: string,
    @Body() removeManyToolsDto: RemoveManyToolsFromAssetGroupDto,
  ) {
    return this.assetGroupService.removeManyTools(
      groupId,
      removeManyToolsDto.toolIds,
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
}
