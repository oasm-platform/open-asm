import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
import { McpGuard } from 'src/common/guards/mcp.guard';
import { McpPermission } from './entities/mcp-permission.entity';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpTools } from './mcp.tools';

@Global()
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
            guards: [McpGuard],
        })
    ],
    providers: [McpTools, McpService],
    exports: [McpService]
})

export class McpServerModule { }