// import { AssetsModule } from '@/modules/assets/assets.module';
// import { IssuesModule } from '@/modules/issues/issues.module';
// import { JobsRegistryModule } from '@/modules/jobs-registry/jobs-registry.module';
// import { StatisticModule } from '@/modules/statistic/statistic.module';
// import { TargetsModule } from '@/modules/targets/targets.module';
// import { ToolsModule } from '@/modules/tools/tools.module';
// import { VulnerabilitiesModule } from '@/modules/vulnerabilities/vulnerabilities.module';
// import { WorkersModule } from '@/modules/workers/workers.module';
// import { WorkspacesModule } from '@/modules/workspaces/workspaces.module';
// import { Global, Module } from '@nestjs/common';
// import { McpModule, McpTransportType } from '@rekog/mcp-nest';
// import { McpController } from './mcp.controller';
// import { McpGuard } from './mcp.guard';
// import { McpPrompts } from './mcp.prompt';
// import { McpResources } from './mcp.resource';
// import { McpService } from './mcp.service';
// import { McpTools } from './mcp.tools';
// @Global()
// @Module({
//   controllers: [McpController],
//   imports: [
//     AssetsModule,
//     WorkspacesModule,
//     TargetsModule,
//     StatisticModule,
//     VulnerabilitiesModule,
//     IssuesModule,
//     ToolsModule,
//     WorkersModule,
//     JobsRegistryModule,
//     McpModule.forRoot({
//       name: 'oasm-server',
//       instructions: 'OpenASM Server',
//       sseEndpoint: '/mcp',
//       version: '1.0.0',
//       transport: McpTransportType.SSE,
//       guards: [McpGuard],
//     }),
//   ],
//   providers: [McpTools, McpService, McpResources, McpPrompts],
//   exports: [McpService],
// })
// export class McpServerModule {}
