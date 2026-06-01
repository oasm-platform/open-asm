import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { server } from './mocks/node';

beforeAll(() =>
  server.listen({
    onUnhandledRequest: 'bypass',
  })
);
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
