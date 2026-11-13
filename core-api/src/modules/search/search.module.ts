import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchHistory } from './entities/search-history.entity';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { TargetsModule } from '../targets/targets.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchHistory, Vulnerability]),
    TargetsModule,
    AssetsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
