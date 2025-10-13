import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsModule } from '../assets/assets.module';
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
    VulnerabilitiesModule,
    TypeOrmModule.forFeature([Statistic, Workspace]),
    ScheduleModule.forRoot(),
  ],
  controllers: [StatisticController],
  providers: [StatisticService, StatisticCronService],
  exports: [StatisticService],
})
export class StatisticModule { }