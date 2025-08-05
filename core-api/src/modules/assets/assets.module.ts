import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../jobs-registry/entities/job.entity';
import { Target } from '../targets/entities/target.entity';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';
import { Port } from './entities/ports.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Asset, Job, Target, Port, HttpResponse])],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
