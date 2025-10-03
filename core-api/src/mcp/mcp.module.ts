import { Module } from '@nestjs/common';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpTools } from './mcp.tools';

@Module({
    controllers: [McpController],
    imports: [
        McpModule.forRoot({
            name: 'oasm-server',
            instructions: 'OpenASM Server',
            sseEndpoint: '/mcp',
            version: '1.0.0',
            transport: McpTransportType.SSE,
        })
    ],
    providers: [McpTools, McpService]
})

export class McpServerModule { }