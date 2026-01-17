import logger from 'node-color-log';
import { GrpcService } from './services/grpc.service';
import { Tool } from './tool/tool';

async function main() {
  logger.setDate(() => new Date().toLocaleTimeString());

  const coreApiUrl = process.env.CORE_API_GRPC || 'localhost:50051'; // Default or from env
  const grpcService = new GrpcService(coreApiUrl);

  new Tool(grpcService).run();
}

main();
