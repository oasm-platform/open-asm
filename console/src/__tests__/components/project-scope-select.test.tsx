import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProjectScopeSelect } from '@/pages/agents/components/project-scope-select';

const getMany = vi.fn((..._args: unknown[]) => ({ data: undefined }));
vi.mock('@/services/apis/gen/queries', () => ({
  useProjectsControllerGetMany: (...args: unknown[]) => getMany(...args),
}));

describe('ProjectScopeSelect', () => {
  it("shows an existing chat's project without loading the list", () => {
    render(
      <ProjectScopeSelect value={{ id: 'p1', name: 'Perimeter', hexColor: '#f00' }} />,
    );

    expect(screen.getByText('Perimeter')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(getMany).toHaveBeenCalledWith(
      expect.anything(),
      { query: { enabled: false } },
    );
  });

  it('shows nothing for a chat without a project', () => {
    const { container } = render(<ProjectScopeSelect value={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('offers the whole workspace by default on a new chat', () => {
    render(<ProjectScopeSelect value={null} onChange={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent(
      'Whole workspace',
    );
  });
});
