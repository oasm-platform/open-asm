import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { Vulnerability } from './entities/vulnerability.entity';
import { Asset } from '../assets/entities/assets.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vulnerability, Asset])],
  controllers: [VulnerabilitiesController],
  providers: [VulnerabilitiesService],
  exports: [VulnerabilitiesService],
})
export class VulnerabilitiesModule {}
