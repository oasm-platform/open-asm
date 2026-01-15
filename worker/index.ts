import logger from "node-color-log";
import { Tool } from "./tool/tool";
import { GrpcService } from "./services/grpc.service";

async function main() {
  logger.setDate(() => new Date().toLocaleTimeString());

  const coreApiUrl = process.env.CORE_API_GRPC || "localhost:5000"; // Default or from env
  const grpcService = new GrpcService(coreApiUrl);

  new Tool(grpcService).run();
}

main();
