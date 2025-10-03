import type { Request } from 'express';
import type { Job } from 'src/modules/jobs-registry/entities/job.entity';
import type { DataSource } from 'typeorm';
import type { Role } from '../enums/enum';

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
  image: string;
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

export interface RequestWithMetadata extends Request {
  session: {
    token: string;
    expiresAt: Date;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    ipAddress?: string | null | undefined;
    userAgent?: string | null | undefined;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    image?: string | null | undefined;
    role: Role;
  };
}
