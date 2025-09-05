import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserContext, WorkspaceId } from 'src/common/decorators/app.decorator';
import { Doc } from 'src/common/doc/doc.decorator';
import { GetManyResponseDto } from 'src/utils/getManyResponse';
import { User } from '../auth/entities/user.entity';
import { DeleteResponseDto } from './dto/delete-response.dto';
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
    request: {
      getWorkspaceId: true,
    },
  })
  @Get()
  searchAssetsTargets(
    @UserContext() user: User,
    @Query() query: SearchAssetsTargetsDto,
    @WorkspaceId() workspaceId: string,
  ) {
    return this.searchService.searchAssetsTargets(user, query, workspaceId);
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

  @Doc({
    summary: 'Delete search history by ID',
    description: 'Delete a specific search history entry by its ID',
    response: {
      serialization: DeleteResponseDto,
    },
  })
  @Delete('histories/:id')
  deleteSearchHistory(@UserContext() user: User, @Param('id') id: string) {
    return this.searchService.deleteSearchHistory(user, id);
  }

  @Doc({
    summary: 'Delete all search history',
    description: 'Delete all search history entries for the user',
    response: {
      serialization: DeleteResponseDto,
    },
  })
  @Delete('histories')
  deleteAllSearchHistories(@UserContext() user: User) {
    return this.searchService.deleteAllSearchHistories(user);
  }
}
