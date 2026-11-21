import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/node';
import { setDictionaryForTests } from '@/lib/i18n-dictionary';

// Components render through t(); give tests the real EN text from the backend
// dictionaries so assertions keep matching visible English.
const enFiles = import.meta.glob<Record<string, string>>(
  '../../../core-api/src/i18n/en/*.json',
  { eager: true, import: 'default' },
);
setDictionaryForTests(
  Object.fromEntries(
    Object.entries(enFiles).map(([file, table]) => [
      file.replace(/^.*\/(.+)\.json$/, '$1'),
      table,
    ]),
  ),
);

// jsdom lacks the pointer-capture API; radix-ui Select calls it in its pointer
// handlers and without it select dropdowns never open in tests.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
// jsdom does not implement scrollIntoView; radix-ui Select scrolls the selected
// item into view when the dropdown opens.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'bypass',
  });
  // Mock window.scrollTo for TanStack Router scroll restoration
  window.scrollTo = vi.fn();
  // Mock window.matchMedia for ThemeProvider with system theme
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
