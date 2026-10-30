import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenLink, OpenLinkDialog } from './open-link';

afterEach(() => {
  vi.restoreAllMocks();
});

const renderLink = (href = 'https://example.com') =>
  render(
    <>
      <OpenLink href={href}>Docs</OpenLink>
      <OpenLinkDialog />
    </>,
  );

describe('OpenLink', () => {
  it('confirms before opening, then closes on cancel', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderLink();

    await user.click(screen.getByRole('link', { name: 'Docs' }));

    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Open external link?' }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the link in a new tab when confirmed', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderLink();

    await user.click(screen.getByRole('link', { name: 'Docs' }));
    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not intercept non-http links', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderLink('mailto:security@example.com');

    await user.click(screen.getByRole('link', { name: 'Docs' }));

    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
