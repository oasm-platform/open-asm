import * as grpc from '@grpc/grpc-js';
import { createReflectionClient, GrpcReflection } from 'grpc-js-reflection-client';
import type { GrpcClientConfig, DiscoveredService } from './types';

export class DynamicGrpcClient {
  private client: grpc.Client | null = null;
  private reflectionClient: GrpcReflection | null = null;
  private services: Map<string, any> = new Map();
  private config: GrpcClientConfig;

  constructor(config: GrpcClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const address = `${this.config.host}:${this.config.port}`;
    this.client = new grpc.Client(address, grpc.credentials.createInsecure());
    this.reflectionClient = createReflectionClient(this.client);
    
    await this.discoverServices();
  }

  async discoverServices(): Promise<DiscoveredService[]> {
    if (!this.reflectionClient) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const services = await this.reflectionClient.listServices();
    
    for (const service of services) {
      this.services.set(service.name, service);
    }

    return services;
  }

  getServices(): DiscoveredService[] {
    return Array.from(this.services.values());
  }

  async callMethod<T = any>(
    serviceName: string,
    methodName: string,
    requestData: Buffer | object
  ): Promise<T> {
    if (!this.client || !this.reflectionClient) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const fullName = `/${serviceName}/${methodName}`;
    const definition = await this.reflectionClient.getMethodDesc(fullName);
    
    if (!definition) {
      throw new Error(`Method ${fullName} not found`);
    }

    return new Promise((resolve, reject) => {
      const data = Buffer.isBuffer(requestData) 
        ? requestData 
        : Buffer.from(JSON.stringify(requestData));

      this.client!.makeUnaryRequest(
        fullName,
        (arg: Buffer) => arg,
        (arg: Buffer) => arg,
        data,
        (err: grpc.ServiceError | null, response: Buffer) => {
          if (err) {
            reject(err);
          } else {
            try {
              resolve(JSON.parse(response.toString()) as T);
            } catch {
              resolve(response as unknown as T);
            }
          }
        }
      );
    });
  }

  async callWorkersJoin(apiKey: string, signature: string): Promise<{ id: string; token: string }> {
    return this.callMethod('workers.WorkersService', 'Join', { apiKey, signature });
  }

  async callWorkersAlive(token: string): Promise<boolean> {
    return this.callMethod('workers.WorkersService', 'Alive', { workerToken: token });
  }

  async callJobsNext(workerId: string): Promise<any> {
    return this.callMethod('jobs_registry.JobsRegistryService', 'Next', { id: workerId });
  }

  async callJobsResult(workerId: string, data: any): Promise<{ success: boolean }> {
    return this.callMethod('jobs_registry.JobsRegistryService', 'Result', {
      workerId,
      data
    });
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.reflectionClient = null;
    this.services.clear();
  }
}

export function createGrpcClient(host: string, port: number): DynamicGrpcClient {
  return new DynamicGrpcClient({ host, port });
}