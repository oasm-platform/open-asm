import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, "../proto/workers.proto");
const JOBS_REGISTRY_PROTO_PATH = path.join(
  __dirname,
  "../proto/jobs_registry.proto"
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const jobsRegistryPackageDefinition = protoLoader.loadSync(
  JOBS_REGISTRY_PROTO_PATH,
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const jobsRegistryProtoDescriptor = grpc.loadPackageDefinition(
  jobsRegistryPackageDefinition
) as any;

const workersService = protoDescriptor.workers.WorkersService;
const jobsRegistryService =
  jobsRegistryProtoDescriptor.jobs_registry.JobsRegistryService;

export class GrpcService {
  private client: any;
  private jobsRegistryClient: any;

  constructor(private address: string) {
    this.client = new workersService(
      this.address,
      grpc.credentials.createInsecure()
    );
    this.jobsRegistryClient = new jobsRegistryService(
      this.address,
      grpc.credentials.createInsecure()
    );
  }

  join(apiKey: string): Promise<{ worker_id: string; worker_token: string }> {
    return new Promise((resolve, reject) => {
      this.client.Join({ api_key: apiKey }, (err: any, response: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  }

  alive(): grpc.ClientDuplexStream<any, any> {
    return this.client.Alive();
  }

  next(workerId: string, token: string): Promise<any> {
    const metadata = new grpc.Metadata();
    metadata.add("worker-token", token);

    return new Promise((resolve, reject) => {
      this.jobsRegistryClient.Next(
        { id: workerId },
        metadata,
        (err: any, response: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  result(workerId: string, data: any, token: string): Promise<any> {
    const metadata = new grpc.Metadata();
    metadata.add("worker-token", token);

    return new Promise((resolve, reject) => {
      this.jobsRegistryClient.Result(
        { worker_id: workerId, data: data },
        metadata,
        (err: any, response: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        }
      );
    });
  }
}
