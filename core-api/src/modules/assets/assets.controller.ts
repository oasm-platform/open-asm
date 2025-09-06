import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkspaceId } from 'src/common/decorators/workspace-id.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { AssetsService } from './assets.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetStatusCodeAssetsDTO } from './dto/get-status-code-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Doc({
    summary: 'Get assets in target',
    description: 'Retrieves a list of assets associated with the given target.',
    response: {
      serialization: GetManyResponseDto(GetAssetsResponseDto),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  getAssetsInWorkspace(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getAssetsInWorkspace(query, workspaceId);
  }

  @Doc({
    summary: 'Get IP asset',
    description: 'Retrieves a list of ip with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetIpAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/ip')
  getIpAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getIpAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get ports and number of assets',
    description: 'Retrieves a list of port with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetPortAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/port')
  getPortAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getPortAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get technologies along with number of assets',
    description: 'Retrieves a list of technologies with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetTechnologyAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/tech')
  getTechnologyAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getTechnologyAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get technologies along with number of assets',
    description: 'Retrieves a list of technologies with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetStatusCodeAssetsDTO),
    },
    request: {
      getWorkspaceId: true,
    },
  })
  @Get('/status-code')
  getStatusCodeAssets(
    @Query() query: GetAssetsQueryDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.assetsService.getStatusCodeAssets(query, workspaceId);
  }

  @Doc({
    summary: 'Get asset by ID',
    description: 'Retrieves a single asset by its ID.',
    response: {
      serialization: GetAssetsResponseDto,
    },
  })
  @Get(':id')
  getAssetById(@Param('id') id: string) {
    return this.assetsService.getAssetById(id);
  }

  @Doc({
    summary: 'Update asset by ID',
    description: 'Updates an asset by its ID. Only tags can be updated.',
    response: {
      serialization: GetAssetsResponseDto,
    },
  })
  @Patch(':id')
  updateAssetById(
    @Param('id') id: string,
    @Body() updateAssetDto: UpdateAssetDto,
  ) {
    return this.assetsService.updateAssetById(id, updateAssetDto);
  }
}
