import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchHistory } from './entities/search-history.entity';
import { TargetsModule } from '../targets/targets.module';
import { AssetsModule } from '../assets/assets.module';
import { StatisticModule } from '../statistic/statistic.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchHistory]),
    TargetsModule,
    AssetsModule,
    StatisticModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
