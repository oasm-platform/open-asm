import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    TargetsModule,
    AssetsModule,
    forwardRef(() => VulnerabilitiesModule),
    TypeOrmModule.forFeature([Statistic, Workspace]),
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [StatisticController],
  providers: [StatisticService, StatisticCronService],
  exports: [StatisticService],
})
export class StatisticModule {}
