import { Module } from '@nestjs/common';
import { DataNormalizationService } from './data-normalization.service';
import { DataNormalizationController } from './data-normalization.controller';

@Module({
  controllers: [DataNormalizationController],
  providers: [DataNormalizationService],
})
export class DataNormalizationModule {}
