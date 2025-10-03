import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
import { McpPermission } from './entities/mcp-permission.entity';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpTools } from './mcp.tools';

@Module({
    controllers: [McpController],
    imports: [
        TypeOrmModule.forFeature([McpPermission]),
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