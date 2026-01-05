import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { Vulnerability } from './entities/vulnerability.entity';
import { Asset } from '../assets/entities/assets.entity';
import { VulnerabilityDismissal } from './entities/vulnerability-dismissal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vulnerability, Asset, VulnerabilityDismissal]),
  ],
  controllers: [VulnerabilitiesController],
  providers: [VulnerabilitiesService],
  exports: [VulnerabilitiesService],
})
export class VulnerabilitiesModule {}
