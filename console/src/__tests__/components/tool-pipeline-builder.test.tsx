import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import type { Tool } from '@/services/apis/gen/queries';
import { ToolPipelineBuilder } from '@/pages/asset-group/components/tool-pipeline-builder';

vi.mock('@/services/apis/gen/queries', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/services/apis/gen/queries')
  >();
  return {
    ...actual,
    useToolConfigProfilesControllerList: () => ({
      data: [],
      isLoading: false,
    }),
  };
});

const tool = {
  id: 'tool-1',
  name: 'Nuclei',
  type: 'provider',
  logoUrl: '',
} as unknown as Tool;

/**
 * Radix only positions the popper once the `PopoverAnchor asChild` child
 * registers a DOM node via ref. If the child is a component that does not
 * forward its ref, the anchor stays null, floating-ui never runs, and the
 * content keeps its off-screen sentinel transform — the panel is in the DOM
 * but invisible, i.e. "clicking does nothing". jsdom text queries cannot see
 * that; the wrapper transform can.
 */
async function expectPopoverAnchored() {
  const wrapper = document.querySelector(
    '[data-radix-popper-content-wrapper]',
  );
  expect(wrapper).not.toBeNull();
  await waitFor(() =>
    expect((wrapper as HTMLElement).style.transform).not.toBe(
      'translate(0, -200%)',
    ),
  );
}

describe('ToolPipelineBuilder — tool click opens its panel', () => {
  it('opens the pending panel for a tool not yet added', async () => {
    const { user } = renderWithProviders(
      <ToolPipelineBuilder tools={[tool]} value={[]} onChange={vi.fn()} />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Add Nuclei to pipeline' }),
    );

    expect(await screen.findByText('Add to pipeline')).toBeInTheDocument();
    await expectPopoverAnchored();
  });

  it('opens the selected panel for a tool already added', async () => {
    const { user } = renderWithProviders(
      <ToolPipelineBuilder
        tools={[tool]}
        value={[{ toolId: 'tool-1' }]}
        onChange={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Configure Nuclei' }),
    );

    expect(await screen.findByText('#1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Inline config')).toBeInTheDocument();
    await expectPopoverAnchored();
  });
});
