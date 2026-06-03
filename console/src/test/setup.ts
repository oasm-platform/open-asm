import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/node';

beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'bypass',
  });
  // Mock window.scrollTo for TanStack Router scroll restoration
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
