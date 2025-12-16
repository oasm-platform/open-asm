import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entities/issue.entity';
import { VulnerabilitySourceHandler } from './handlers/vulnerability-source.handler';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({
    imports: [TypeOrmModule.forFeature([Issue]), VulnerabilitiesModule],
    controllers: [IssuesController],
    providers: [IssuesService, VulnerabilitySourceHandler],
    exports: [IssuesService],
})
export class IssuesModule { }
