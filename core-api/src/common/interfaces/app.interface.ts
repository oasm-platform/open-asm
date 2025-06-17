import { Role } from '../enums/enum';

export interface UserContextPayload {
  session: Session;
  user: User;
}

export interface Session {
  expiresAt: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string;
  userAgent: string;
  userId: string;
  id: string;
}

export interface User {
  name: string;
  email: string;
  emailVerified: boolean;
  image: any;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  id: string;
}
