import { Role } from '../enums/enum';

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
