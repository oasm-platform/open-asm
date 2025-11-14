import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { JobsRegistryModule } from './jobs-registry/jobs-registry.module';
import { RootModule } from './root/root.module';
import { SearchModule } from './search/search.module';
import { StatisticModule } from './statistic/statistic.module';
import { TargetsModule } from './targets/targets.module';
import { TechnologyModule } from './technology/technology.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { WorkersModule } from './workers/workers.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { DataAdapterModule } from './data-adapter/data-adapter.module';
import { ApiKeysModule } from './apikeys/apikeys.module';
import { ProvidersModule } from './providers/providers.module';
import { TemplatesModule } from './templates/templates.module';
import { AssetGroupModule } from './asset-group/asset-group.module';

@Module({
  imports: [
    AuthModule.forRoot({
      disableExceptionFilter: true,
    }),
    TargetsModule,
    WorkspacesModule,
    UsersModule,
    RootModule,
    JobsRegistryModule,
    AssetsModule,
    TechnologyModule,
    WorkersModule,
    SearchModule,
    ToolsModule,
    VulnerabilitiesModule,
    DataAdapterModule,
    WorkflowsModule,
    StatisticModule,
    ApiKeysModule,
    ProvidersModule,
    TemplatesModule,
    AssetGroupModule,
  ],
})
export class CombineModule {}
