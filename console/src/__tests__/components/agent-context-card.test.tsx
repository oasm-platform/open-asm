import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders, screen } from '@/test/utils';

import { AgentContextCard } from '@/pages/projects/components/agent-context-card';
import type { Project } from '@/services/apis/gen/queries';

const updateMock = vi.fn();
const filesRef: { value: Array<{ id: string; name: string; sizeBytes: number }> } = {
  value: [],
};
vi.mock('@/services/apis/gen/queries', () => ({
  getProjectsControllerGetFilesQueryKey: (id: string) => ['files', id],
  projectsControllerPresignFile: vi.fn(),
  projectsControllerCompleteFile: vi.fn(),
  useProjectsControllerGetFiles: () => ({ data: filesRef.value }),
  useProjectsControllerRemoveFile: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectsControllerUpdate: () => ({ mutate: updateMock, isPending: false }),
}));
vi.mock('@/pages/projects/project-utils', () => ({
  apiErrorMessage: (_e: unknown, fallback: string) => fallback,
  useInvalidateProjects: () => vi.fn(),
}));

const project = (over: Partial<Project> = {}) =>
  ({ id: 'p1', name: 'Perimeter', instruction: null, archivedAt: null, ...over }) as Project;

const file = (n: number) => ({ id: `f${n}`, name: `notes-${n}.md`, sizeBytes: 2048 });

describe('AgentContextCard', () => {
  beforeEach(() => {
    updateMock.mockReset();
    filesRef.value = [];
  });

  it('saves the instruction, counting it against the limit', async () => {
    renderWithProviders(<AgentContextCard project={project()} />);

    const box = await screen.findByLabelText('Instructions');
    fireEvent.change(box, { target: { value: '  Only staging hosts ' } });
    expect(screen.getByText('21/2000')).toBeInTheDocument();
    expect(box).toHaveAttribute('maxLength', '2000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateMock).toHaveBeenCalledWith(
      { id: 'p1', data: { instruction: 'Only staging hosts' } },
      expect.anything(),
    );
  });

  it('lists the attached files and stops uploads at five', async () => {
    filesRef.value = [1, 2, 3, 4, 5].map(file);
    renderWithProviders(<AgentContextCard project={project()} />);

    expect(await screen.findByText('notes-1.md')).toBeInTheDocument();
    expect(screen.getAllByText('2.0 KB')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /Upload/ })).toBeDisabled();
  });

  it('is read-only on an archived project', async () => {
    filesRef.value = [file(1)];
    renderWithProviders(
      <AgentContextCard project={project({ archivedAt: '2026-01-01T00:00:00Z' })} />,
    );

    expect(await screen.findByLabelText('Instructions')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Detach notes-1.md' })).toBeDisabled();
  });
});
