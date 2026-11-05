import { describe, expect, it } from 'vitest';
import {
  capabilityOf,
  describeKinds,
  pipelineHint,
} from '@/pages/projects/components/tool-io';
import { DataKind, ToolCategory } from '@/services/apis/gen/queries';

describe('pipeline tool inputs', () => {
  it('needs no hint when every run has the first choice', () => {
    expect(pipelineHint([DataKind.host], [])).toBeUndefined();
  });

  it('needs no hint when an earlier step finds it', () => {
    expect(pipelineHint([DataKind.web, DataKind.host], [DataKind.web])).toBeUndefined();
  });

  it('explains the fallback when nothing earlier finds the first choice', () => {
    expect(pipelineHint([DataKind.web, DataKind.host], [DataKind.service])).toBe(
      'No earlier step finds web services, so it scans hosts unless an earlier run found their web services.',
    );
  });

  it('warns when it has no fallback', () => {
    expect(pipelineHint([DataKind.service], [])).toBe(
      'No earlier step finds open ports, so it only scans open ports found by earlier runs.',
    );
  });

  it('reads the chosen category, else the first', () => {
    const tool = {
      categories: [
        { name: ToolCategory.ports_scanner, targetTypes: [], inputs: [DataKind.host], produces: [DataKind.service] },
        { name: ToolCategory.vulnerabilities, targetTypes: [], inputs: [DataKind.host], produces: [DataKind.vulnerability] },
      ],
    };
    expect(capabilityOf(tool)?.name).toBe(ToolCategory.ports_scanner);
    expect(capabilityOf(tool, ToolCategory.vulnerabilities)?.produces).toEqual([DataKind.vulnerability]);
    expect(describeKinds([DataKind.web, DataKind.host])).toBe('web services, else hosts');
  });
});
