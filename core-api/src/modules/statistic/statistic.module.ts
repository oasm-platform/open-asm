import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { Statistic } from './entities/statistic.entity';
import { ReportStatisticsService } from './report-statistics.service';
import { StatisticCronService } from './statistic-cron.service';
import { StatisticController } from './statistic.controller';
import { StatisticSnapshotService } from './statistic-snapshot.service';
import { StatisticService } from './statistic.service';
import { TechnologyModule } from '../technology/technology.module';

@Module({
  imports: [
    TargetsModule,
    AssetsModule,
    VulnerabilitiesModule,
    TypeOrmModule.forFeature([Statistic]),
    NotificationsModule,
    TechnologyModule,
  ],
  controllers: [StatisticController],
  providers: [
    StatisticService,
    StatisticSnapshotService,
    ReportStatisticsService,
    StatisticCronService,
  ],
  exports: [StatisticService, ReportStatisticsService],
})
export class StatisticModule {}
