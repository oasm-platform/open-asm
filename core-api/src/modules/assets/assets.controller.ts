import { Controller, Get, Param, Query } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { IdQueryParamDto } from 'src/common/dtos/id-query-param.dto';
import { Doc } from 'src/common/doc/doc.decorator';
import { Asset } from './entities/assets.entity';
import {
  GetManyBaseQueryParams,
  GetManyResponseDto,
} from 'src/common/dtos/get-many-base.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Doc({
    summary: 'Get assets in target',
    description: 'Retrieves a list of assets associated with the given target.',
    response: {
      serialization: GetManyResponseDto<Asset>,
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
