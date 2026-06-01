export const TEST_USERS = {
  admin: {
    email: 'admin@test.com',
    password: 'Test1234!',
    name: 'Test Admin',
    role: 'admin',
  },
  user: {
    email: 'user@test.com',
    password: 'Test1234!',
    name: 'Test User',
    role: 'user',
  },
};

export const TEST_TARGETS = {
  domain: { value: 'test-domain.com', type: 'DOMAIN' },
  ip: { value: '192.168.1.1', type: 'IP' },
  cidr: { value: '10.0.0.0/24', type: 'CIDR' },
};

export const TEST_WORKSPACE = {
  name: 'Test Workspace',
  slug: 'test-workspace',
};
