import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";
import type { ProtoGrpcType as WorkerProtoType } from "../proto/generated/workers";
import type { ProtoGrpcType as JobsRegistryProtoType } from "../proto/generated/jobs_registry";
import type { WorkersServiceClient } from "../proto/generated/workers/WorkersService";
import type { JobsRegistryServiceClient } from "../proto/generated/jobs_registry/JobsRegistryService";
import type { Job } from "../proto/generated/jobs_registry/Job";
import type { UpdateResultDto } from "../proto/generated/jobs_registry/UpdateResultDto";
import type { JoinResponse } from "../proto/generated/workers/JoinResponse";
import type { AliveResponse } from "../proto/generated/workers/AliveResponse";
import type { AliveRequest } from "../proto/generated/workers/AliveRequest";
import type { JobResponse } from "../proto/generated/jobs_registry/JobResponse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PROTO_PATH = path.join(__dirname, "../proto/workers.proto");
const JOBS_REGISTRY_PROTO_PATH = path.join(
  __dirname,
  "../proto/jobs_registry.proto"
);

const workerPackageDefinition = protoLoader.loadSync(WORKER_PROTO_PATH, {
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

const protoDescriptor = grpc.loadPackageDefinition(
  workerPackageDefinition
) as unknown as WorkerProtoType;
const jobsRegistryProtoDescriptor = grpc.loadPackageDefinition(
  jobsRegistryPackageDefinition
) as unknown as JobsRegistryProtoType;

const workersService = protoDescriptor.workers.WorkersService;
const jobsRegistryService =
  jobsRegistryProtoDescriptor.jobs_registry.JobsRegistryService;

export class GrpcService {
  private workerClient: WorkersServiceClient;
  private jobsRegistryClient: JobsRegistryServiceClient;

  constructor(private address: string) {
    const credentials =
      process.env.CORE_API_SECURE === "true"
        ? grpc.credentials.createSsl()
        : grpc.credentials.createInsecure();

    // Cast the untyped service constructors to any first, then to the strictly typed client interface
    this.workerClient = new (workersService as any)(
      this.address,
      credentials
    ) as WorkersServiceClient;
    this.jobsRegistryClient = new (jobsRegistryService as any)(
      this.address,
      credentials
    ) as JobsRegistryServiceClient;
  }

  join(apiKey: string): Promise<JoinResponse> {
    return new Promise((resolve, reject) => {
      this.workerClient.Join({ api_key: apiKey }, (err, response) => {
        if (err) {
          reject(err);
        } else {
          resolve(response!);
        }
      });
    });
  }

  alive(): grpc.ClientDuplexStream<AliveRequest, AliveResponse> {
    return this.workerClient.Alive();
  }

  next(workerId: string, token: string): Promise<Job> {
    const metadata = new grpc.Metadata();
    metadata.add("worker-token", token);

    return new Promise((resolve, reject) => {
      this.jobsRegistryClient.Next(
        { id: workerId },
        metadata,
        (err, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response!);
          }
        }
      );
    });
  }

  result(
    workerId: string,
    data: UpdateResultDto,
    token: string
  ): Promise<JobResponse> {
    const metadata = new grpc.Metadata();
    metadata.add("worker-token", token);

    return new Promise((resolve, reject) => {
      this.jobsRegistryClient.Result(
        { worker_id: workerId, data: data },
        metadata,
        (err, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response!);
          }
        }
      );
    });
  }
}
