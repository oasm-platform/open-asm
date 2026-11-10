import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import { AI_GEN_TEMPLATE_PROMPT, AiGenButton } from './ai-gen-button';

let allowed = true;
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => allowed }),
}));

describe('AiGenButton', () => {
  it('links to a new AI Studio chat with the template prompt filled in, not sent', async () => {
    allowed = true;
    renderWithProviders(<AiGenButton />);

    const link = await screen.findByRole('link', { name: /AI gen/ });
    const url = new URL(link.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/aistudio');
    expect(url.searchParams.get('text')).toBe(AI_GEN_TEMPLATE_PROMPT);
    expect(url.searchParams.get('autoSubmit')).toBe('false');
    expect(AI_GEN_TEMPLATE_PROMPT).toContain('nuclei-template-generator');
  });

  it('is hidden without access to AI Studio', () => {
    allowed = false;
    renderWithProviders(<AiGenButton />);
    expect(screen.queryByRole('link', { name: /AI gen/ })).toBeNull();
  });
});
