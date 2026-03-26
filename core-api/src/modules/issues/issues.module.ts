import { BullMQName } from '@/common/enums/enum';
import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsRegistryModule } from '../jobs-registry/jobs-registry.module';
import { IssueComment } from './entities/issue-comment.entity';
import { Issue } from './entities/issue.entity';
import { VulnerabilitySourceHandler } from './handlers/vulnerability-source.handler';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, IssueComment]),
    VulnerabilitiesModule,
    JobsRegistryModule,
    BullModule.registerQueue({
      name: BullMQName.ISSUE_CREATION,
      defaultJobOptions: {
        removeOnComplete: {
          age: 5,
        },
        removeOnFail: true,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
  ],
  controllers: [IssuesController],
  providers: [IssuesService, VulnerabilitySourceHandler],
  exports: [IssuesService],
})
export class IssuesModule {}
