import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiTags } from '@nestjs/swagger';
import {
  SearchAssetsTargetsDto,
  SearchAssetsTargetsResponseDto,
} from './dto/search.dto';
import { Doc } from 'src/common/doc/doc.decorator';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Doc({
    summary: 'Search assets and targets',
    description: 'Search assets and targets',
    response: {
      serialization: SearchAssetsTargetsResponseDto,
    },
  })
  @Get()
  searchAssetsTargets(@Query() query: SearchAssetsTargetsDto) {
    return this.searchService.searchAssetsTargets(query);
  }
}
