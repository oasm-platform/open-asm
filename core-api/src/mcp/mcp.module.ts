import { Module } from '@nestjs/common';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
import { McpTools } from './mcp.tools';

@Module({
    imports: [
        McpModule.forRoot({
            name: 'oasm-server',
            instructions: 'OpenASM Server',
            sseEndpoint: '/mcp',
            version: '1.0.0',
            transport: McpTransportType.SSE,
        })
    ],
    providers: [McpTools]
})

export class McpServerModule { }