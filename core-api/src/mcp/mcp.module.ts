import { API_GLOBAL_PREFIX } from '@/common/constants/app.constants';
import { AgentsModule } from '@/modules/agents/agents.module';
import { ApiKeysModule } from '@/modules/apikeys/apikeys.module';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { json } from 'express';
import { McpController } from './mcp.controller';
import { McpGuard } from './mcp.guard';
import { McpService } from './mcp.service';

@Global()
@Module({
  imports: [AgentsModule, ApiKeysModule],
  controllers: [McpController],
  providers: [McpService, McpGuard],
  exports: [McpService],
})
export class McpServerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // MCP message endpoint needs JSON body parser (global bodyParser: false)
    consumer
      .apply(json())
      .forRoutes(`/${API_GLOBAL_PREFIX}/mcp/message`);
  }
}
