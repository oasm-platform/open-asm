import { Module } from '@nestjs/common';
import { ApiKeysModule } from './apikeys/apikeys.module';
import { AssetGroupModule } from './asset-group/asset-group.module';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { DataAdapterModule } from './data-adapter/data-adapter.module';
import { EventsModule } from './events/events.module';
import { InternalNetworksModule } from './internal-networks/internal-networks.module';
import { IssuesModule } from './issues/issues.module';
import { JobsRegistryModule } from './jobs-registry/jobs-registry.module';
import { ProvidersModule } from './providers/providers.module';
import { RootModule } from './root/root.module';
import { SearchModule } from './search/search.module';
import { StatisticModule } from './statistic/statistic.module';
// Keep below JobsRegistryModule: AdminModule pulls in ToolsService, and loading
// it first trips the tools <-> workers <-> jobs-registry import cycle.
import { AdminModule } from './admin/admin.module';
import { TargetsModule } from './targets/targets.module';
import { TechnologyModule } from './technology/technology.module';
import { TemplatesModule } from './templates/templates.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WorkersModule } from './workers/workers.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AgentsModule } from './agents/agents.module';
import { RemoteExecuteModule } from './remote-execute/remote-execute.module';
import { ReportsModule } from './reports/reports.module';
import { ArtifactsModule } from './artifacts/artifacts.module';

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
    IssuesModule,
    AdminModule,
    InternalNetworksModule,
    AgentsModule,
    RemoteExecuteModule,
    ReportsModule,
    ArtifactsModule,
    IntegrationsModule,
    ConnectorsModule,
    EventsModule,
  ],
})
export class CombineModule {}
