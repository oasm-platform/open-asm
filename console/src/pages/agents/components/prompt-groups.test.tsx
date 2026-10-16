import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_PROMPT_GROUPS,
  ASK_PROMPT_GROUPS,
} from './landing-constants';
import { PromptGroups } from './prompt-groups';

// Reduced motion skips exit animations, which never finish under jsdom.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));

const vulnerabilities = ASK_PROMPT_GROUPS.find((g) => g.id === 'vulnerabilities')!;

describe('PromptGroups', () => {
  it('shows one chip per group', () => {
    render(<PromptGroups groups={ASK_PROMPT_GROUPS} onSelect={vi.fn()} />);

    for (const group of ASK_PROMPT_GROUPS) {
      expect(screen.getByRole('button', { name: group.label })).toBeTruthy();
    }
  });

  it("opens a group's prompts and sends the one picked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PromptGroups groups={ASK_PROMPT_GROUPS} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Vulnerabilities' }));

    const list = screen.getByRole('list', { name: 'Vulnerabilities prompts' });
    expect(within(list).getAllByRole('button')).toHaveLength(
      vulnerabilities.prompts.length,
    );
    // The panel replaces the chips.
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();

    await user.click(
      within(list).getByRole('button', { name: vulnerabilities.prompts[0] }),
    );
    expect(onSelect).toHaveBeenCalledWith(vulnerabilities.prompts[0]);
    // Picking a prompt closes the panel.
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
  });

  it('closes on a click outside, but not on a click inside the panel', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <PromptGroups groups={ASK_PROMPT_GROUPS} onSelect={vi.fn()} />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await user.click(screen.getByRole('list', { name: 'Overview prompts' }));
    expect(screen.getByRole('list', { name: 'Overview prompts' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('list', { name: 'Overview prompts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
  });

  it('goes back to the chips with X or Escape', async () => {
    const user = userEvent.setup();
    render(<PromptGroups groups={ASK_PROMPT_GROUPS} onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Vulnerabilities' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Vulnerabilities' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
  });

  it('previews the hovered prompt and clears it on leaving the list or closing', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      <PromptGroups
        groups={ASK_PROMPT_GROUPS}
        onSelect={vi.fn()}
        onPreview={onPreview}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Vulnerabilities' }));
    const list = screen.getByRole('list', { name: 'Vulnerabilities prompts' });

    await user.hover(
      within(list).getByRole('button', { name: vulnerabilities.prompts[1] }),
    );
    expect(onPreview).toHaveBeenLastCalledWith(vulnerabilities.prompts[1]);

    await user.unhover(list);
    expect(onPreview).toHaveBeenLastCalledWith(null);

    await user.hover(
      within(list).getByRole('button', { name: vulnerabilities.prompts[2] }),
    );
    await user.keyboard('{Escape}');
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('keeps the panel open after selecting when closeOnSelect is false', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <PromptGroups
        groups={AGENT_PROMPT_GROUPS}
        onSelect={onSelect}
        closeOnSelect={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Recon' }));
    const list = screen.getByRole('list', { name: 'Recon prompts' });
    const first = AGENT_PROMPT_GROUPS[0].prompts[0];

    await user.click(within(list).getByRole('button', { name: first }));

    expect(onSelect).toHaveBeenCalledWith(first);
    // The panel stays open so the user can pick again or edit the input.
    expect(screen.getByRole('list', { name: 'Recon prompts' })).toBeTruthy();
  });

  it('shows a different set of groups per mode and closes the panel on switch', () => {
    const { rerender } = render(
      <PromptGroups groups={ASK_PROMPT_GROUPS} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recon' })).toBeNull();

    rerender(<PromptGroups groups={AGENT_PROMPT_GROUPS} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Recon' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
  });

  it('keeps every prompt unique within each group', () => {
    for (const group of [...ASK_PROMPT_GROUPS, ...AGENT_PROMPT_GROUPS]) {
      expect(new Set(group.prompts).size).toBe(group.prompts.length);
    }
  });
});
