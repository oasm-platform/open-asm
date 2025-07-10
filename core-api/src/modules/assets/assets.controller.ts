import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import {
  GetManyBaseQueryParams,
  GetManyBaseResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { AssetsService } from './assets.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Doc({
    summary: 'Get assets in workspace',
    description:
      'Retrieves a list of assets associated with the given workspace.',
    response: {
      serialization: GetManyBaseResponseDto<GetAssetsResponseDto>,
    },
  })
  @Get('')
  getAssetsInWorkspace(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getAssetsInWorkspace(query);
  }

  @Doc({
    summary: 'Get assets in target',
    description: 'Retrieves a list of assets associated with the given target.',
    response: {
      serialization: GetManyBaseResponseDto<GetAssetsResponseDto>,
    },
  })
  @Get('/target/:id')
  getAllAssetsInTarget(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetManyBaseQueryParams,
  ) {
    return this.assetsService.getAllAssetsInTarget(id, query);
  }
}
