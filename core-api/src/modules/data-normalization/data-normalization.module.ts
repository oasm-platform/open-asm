import { Global, Module } from '@nestjs/common';
import { DataNormalizationController } from './data-normalization.controller';
import { DataNormalizationService } from './data-normalization.service';

@Global()
@Module({
  controllers: [DataNormalizationController],
  providers: [DataNormalizationService],
  exports: [DataNormalizationService],
})
export class DataNormalizationModule {}
