import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASK_PROMPT_GROUPS } from '@/pages/agents/components/landing-constants';
import { CommandPalette } from './command-palette';

const askPrompts = ASK_PROMPT_GROUPS.flatMap((group) => group.prompts);

/** The AI starter questions on screen, in order */
function shownSuggestions() {
  return screen
    .queryAllByRole('option')
    .map((option) => option.textContent ?? '')
    .filter((text) => askPrompts.includes(text));
}

const navigateMock = vi.fn();
const openChatMock = vi.fn();
const searchState = vi.hoisted(() => ({
  current: {} as { data?: unknown; isFetching: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/hooks/useAiChat', () => ({
  useAiChat: () => ({ openChat: openChatMock }),
}));

// The placeholder animation is not under test: hold the hints still.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));

// The debounce is not under test: hand the typed value straight through.
vi.mock('@/hooks/use-debounce', () => ({
  default: <T,>(value: T) => value,
}));

vi.mock('@/components/common/layout/menu-bar', () => ({
  menu: [{ items: [{ title: 'Assets', url: '/assets', icon: null }] }],
}));

vi.mock('@/services/apis/gen/queries', () => ({
  useSearchControllerSearchAssetsTargets: () => searchState.current,
}));

const empty = {
  total: 0,
  data: { targets: [], assets: [], vulnerabilities: [] },
};

// Keystrokes without the default per-key delay: under a busy full-suite run
// the delays added up past the test timeout.
function setupUser() {
  return userEvent.setup({ delay: null });
}

async function openAndType(text: string) {
  const user = setupUser();
  render(<CommandPalette />);
  await user.click(screen.getByRole('button', { name: 'Open command palette' }));
  await user.type(screen.getByRole('combobox'), text);
  return user;
}

describe('CommandPalette Ask AI', () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver; cmdk measures the list with it
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    navigateMock.mockReset();
    openChatMock.mockReset();
    searchState.current = { data: empty, isFetching: false };
  });

  it('offers Ask AI when nothing matches and opens the AI sidebar in ask mode', async () => {
    const user = await openAndType('  zero-day  ');
    await user.click(screen.getByRole('option', { name: /Ask AI about/ }));
    expect(openChatMock).toHaveBeenCalledWith({
      text: 'zero-day',
      agentMode: 'ask',
    });
    // Stays on the page: the chat opens beside it
    expect(navigateMock).not.toHaveBeenCalled();
    // The palette closes after the pick
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens Ask AI on Enter when it is the only item', async () => {
    const user = await openAndType('zero-day');
    await user.keyboard('{Enter}');
    expect(openChatMock).toHaveBeenCalledWith({
      text: 'zero-day',
      agentMode: 'ask',
    });
  });

  it('hides Ask AI while the search is loading', async () => {
    searchState.current = { data: undefined, isFetching: true };
    await openAndType('zero-day');
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  });

  it('hides Ask AI when the server found something', async () => {
    searchState.current = {
      data: {
        total: 1,
        data: {
          targets: [{ id: 't1', value: 'zero-day.example.com' }],
          assets: [],
          vulnerabilities: [],
        },
      },
      isFetching: false,
    };
    await openAndType('zero-day');
    expect(screen.getByText('zero-day.example.com')).toBeInTheDocument();
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
  });

  it('hides Ask AI when a page matches', async () => {
    await openAndType('assets');
    expect(screen.getByRole('option', { name: /Assets/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ask AI/)).not.toBeInTheDocument();
  });

  it('offers three starter questions beside the pages for an empty input', async () => {
    await openAndType('   ');
    expect(screen.queryByText(/Ask AI about/)).not.toBeInTheDocument();
    expect(screen.getByText('Ask AI')).toBeInTheDocument();
    expect(new Set(shownSuggestions()).size).toBe(3);
    expect(screen.getByRole('option', { name: /Assets/ })).toBeInTheDocument();
  });

  it('asks the AI a starter question in the sidebar', async () => {
    const user = setupUser();
    render(<CommandPalette />);
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    const [prompt] = shownSuggestions();
    await user.click(screen.getByRole('option', { name: prompt }));
    expect(openChatMock).toHaveBeenCalledWith({ text: prompt, agentMode: 'ask' });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('picks new starter questions each time the palette opens', async () => {
    const user = setupUser();
    render(<CommandPalette />);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    const first = shownSuggestions();
    // Kept while the palette stays open
    await user.type(screen.getByRole('combobox'), 'x{Backspace}');
    expect(shownSuggestions()).toEqual(first);

    await user.keyboard('{Escape}');
    random.mockReturnValue(0);
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    expect(shownSuggestions()).not.toEqual(first);
  });

  it('hides the starter questions once something is typed', async () => {
    await openAndType('zero-day');
    expect(shownSuggestions()).toEqual([]);
  });

  it('shows a whole search hint as the placeholder under reduced motion', async () => {
    const user = setupUser();
    render(<CommandPalette />);
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    const input = screen.getByRole('combobox');
    expect([
      'Search a host, e.g. api.example.com',
      'Search a CVE, e.g. CVE-2024-3400',
      'Search a technology, e.g. nginx',
      'Jump to a page, e.g. Vulnerabilities',
      'Ask AI what is exposed to the internet',
    ]).toContain(input.getAttribute('placeholder'));
  });
});
