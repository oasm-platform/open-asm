import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { AssetsService } from './assets.service';
import { GetAssetsQueryDto, GetAssetsResponseDto } from './dto/assets.dto';

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
  getAssets(@Query() query: GetAssetsQueryDto) {
    return this.assetsService.getAssets(query);
  }
}
