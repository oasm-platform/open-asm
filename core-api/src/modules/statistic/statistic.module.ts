import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { TargetsModule } from '../targets/targets.module';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';

@Module({
  imports: [TargetsModule, AssetsModule, VulnerabilitiesModule],
  controllers: [StatisticController],
  providers: [StatisticService],
  exports: [StatisticService],
})
export class StatisticModule {}