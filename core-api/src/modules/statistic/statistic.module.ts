import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TargetsModule } from '../targets/targets.module';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { Statistic } from './entities/statistic.entity';
import { StatisticCronService } from './statistic-cron.service';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';
import { TechnologyModule } from '../technology/technology.module';

@Module({
  imports: [
    TargetsModule,
    AssetsModule,
    VulnerabilitiesModule,
    TypeOrmModule.forFeature([Statistic, Workspace]),
    NotificationsModule,
    TechnologyModule,
  ],
  controllers: [StatisticController],
  providers: [StatisticService, StatisticCronService],
  exports: [StatisticService],
})
export class StatisticModule {}
