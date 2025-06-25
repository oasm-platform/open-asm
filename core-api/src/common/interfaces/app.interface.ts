import { Job } from 'src/modules/jobs-registry/entities/job.entity';
import { DataSource } from 'typeorm';
import { Role, WorkerName } from '../enums/enum';

export interface UserContextPayload {
  expiresAt: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string;
  userAgent: string;
  userId: string;
  id: string;
}

export interface UserContextPayload {
  name: string;
  email: string;
  emailVerified: boolean;
  image: any;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  id: string;
}

export interface ResultHandler {
  dataSource: DataSource;
  result: string;
  job: Job;
}

export interface Worker {
  id: WorkerName;
  description: string;
  command: string;
  resultHandler: ({ dataSource, result }: ResultHandler) => void;
}
