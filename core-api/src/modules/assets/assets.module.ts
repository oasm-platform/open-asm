import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../jobs-registry/entities/job.entity';
import { Target } from '../targets/entities/target.entity';
import { TechnologyModule } from '../technology/technology.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetService } from './entities/asset-services.entity';
import { Asset } from './entities/assets.entity';
import { HttpResponse } from './entities/http-response.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Asset, Job, Target, HttpResponse, AssetService]),
    TechnologyModule,
    WorkspacesModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
