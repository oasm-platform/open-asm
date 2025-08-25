import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { AssetsService } from './assets.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';
import { GetIpAssetsDTO } from './dto/get-ip-assets.dto';
import { GetPortAssetsDTO } from './dto/get-port-assets.dto';
import { GetTechnologyAssetsDTO } from './dto/get-technology-assets.dto';

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
  })
  @Get()
  getAssetsInWorkspace(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getAssetsInWorkspace(query);
  }

  @Doc({
    summary: 'Get IP asset',
    description: 'Retrieves a list of ip with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetIpAssetsDTO),
    },
  })
  @Get('/ip')
  getIpAssets(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getIpAssets(query);
  }

  @Doc({
    summary: 'Get ports and number of assets',
    description: 'Retrieves a list of port with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetPortAssetsDTO),
    },
  })
  @Get('/port')
  getPortAssets(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getPortAssets(query);
  }

  @Doc({
    summary: 'Get technologies along with number of assets',
    description: 'Retrieves a list of technologies with number of assets.',
    response: {
      serialization: GetManyResponseDto(GetTechnologyAssetsDTO),
    },
  })
  @Get('/tech')
  getTechnologyAssets(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getTechnologyAssets(query);
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
}
