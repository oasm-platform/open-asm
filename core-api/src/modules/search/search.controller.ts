import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { User } from '../auth/entities/user.entity';
import {
  GetManySearchHistoryDto,
  GetSearchHistoryResponseDto,
  SearchAssetsTargetsDto,
  SearchResponseDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Doc({
    summary: 'Search assets and targets',
    description: 'Search assets and targets',
    response: {
      serialization: SearchResponseDto,
    },
  })
  @Get()
  searchAssetsTargets(
    @UserContext() user: User,
    @Query() query: SearchAssetsTargetsDto,
  ) {
    return this.searchService.searchAssetsTargets(user, query);
  }

  @Doc({
    summary: 'Get search history',
    description: 'Get search history',
    response: {
      serialization: GetManyResponseDto(GetSearchHistoryResponseDto),
    },
  })
  @Get('histories')
  getSearchHistory(
    @UserContext() user: User,
    @Query() query: GetManySearchHistoryDto,
  ) {
    return this.searchService.getSearchHistory(user, query);
  }
}
