import { describe, expect, it } from 'vitest';
import { workflowYaml } from '@/components/common/workflow-file-sheet';

describe('workflowYaml', () => {
  it('reads as a file whatever order jsonb kept the keys in', () => {
    const stored = {
      jobs: {
        nuclei: { needs: ['httpx'], run: 'nuclei', input: ['web'] },
        httpx: { run: 'httpx', name: 'Probe' },
      },
      name: 'Web scan',
    };

    expect(workflowYaml(stored)).toBe(
      [
        'name: Web scan',
        'jobs:',
        '  httpx:',
        '    name: Probe',
        '    run: httpx',
        '  nuclei:',
        '    run: nuclei',
        '    input:',
        '      - web',
        '    needs:',
        '      - httpx',
        '',
      ].join('\n'),
    );
  });

  it('keeps a legacy jobs list and an empty definition as they are', () => {
    expect(workflowYaml({ name: 'Old', jobs: [{ run: 'naabu' }] })).toBe(
      'name: Old\njobs:\n  - run: naabu\n',
    );
    expect(workflowYaml(null)).toBe('');
  });
});
