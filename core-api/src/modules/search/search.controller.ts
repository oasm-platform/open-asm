import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiTags } from '@nestjs/swagger';
import {
  GetSearchHistoryResponseDto,
  SearchAssetsTargetsDto,
  SearchAssetsTargetsResponseDto,
} from './dto/search.dto';
import { Doc } from 'src/common/doc/doc.decorator';
import { User } from '../auth/entities/user.entity';
import { UserContext } from 'src/common/decorators/app.decorator';
import { GetManySearchHistoryDto } from './dto/search.dto';
import { GetManyResponseDto } from 'src/utils/getManyResponse';

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
  @Get('history')
  getSearchHistory(
    @UserContext() user: User,
    @Query() query: GetManySearchHistoryDto,
  ) {
    return this.searchService.getSearchHistory(user, query);
  }
}
