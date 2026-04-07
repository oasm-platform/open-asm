export interface GrpcClientConfig {
  host: string;
  port: number;
}

export interface ServiceMethod {
  name: string;
  path: string;
}

export interface DiscoveredService {
  name: string;
  methods: ServiceMethod[];
}

export interface ReflectionClient {
  listServices(): Promise<DiscoveredService[]>;
  getServiceDesc(serviceName: string): Promise<any>;
}