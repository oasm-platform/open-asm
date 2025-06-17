export interface UserContextPayload {
  session: Session;
  user: User;
}

export interface Session {
  expiresAt: string;
  token: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
  role: string;
  id: string;
}
