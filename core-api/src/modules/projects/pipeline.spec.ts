import { DataKind, ToolCategory } from '@/common/enums/enum';
import {
  buildPipelineJobs,
  isProjectOwnedWorkflow,
  pipelineStages,
} from './pipeline';

describe('buildPipelineJobs', () => {
  it('runs tools of one stage in parallel and chains the stages', () => {
    expect(
      buildPipelineJobs([
        { run: 'subfinder', stage: 1 },
        { run: 'naabu', stage: 2 },
        { run: 'httpx', stage: 3 },
        { run: 'nuclei', stage: 4 },
        { run: 'screenshot', stage: 4 },
      ]),
    ).toEqual({
      subfinder: { run: 'subfinder' },
      naabu: { run: 'naabu', needs: ['subfinder'] },
      httpx: { run: 'httpx', needs: ['naabu'] },
      nuclei: { run: 'nuclei', needs: ['httpx'] },
      screenshot: { run: 'screenshot', needs: ['httpx'] },
    });
  });

  it("keeps a tool's chosen input on its job", () => {
    expect(
      buildPipelineJobs([
        { run: 'httpx', stage: 1 },
        { run: 'nuclei', stage: 2, input: [DataKind.WEB] },
      ]),
    ).toEqual({
      httpx: { run: 'httpx' },
      nuclei: { run: 'nuclei', input: ['web'], needs: ['httpx'] },
    });
  });

  it('treats a missing stage as stage 1 and skips gaps between stages', () => {
    expect(
      buildPipelineJobs([
        { run: 'naabu' },
        { run: 'httpx' },
        { run: 'nuclei', stage: 5 },
      ]),
    ).toEqual({
      naabu: { run: 'naabu' },
      httpx: { run: 'httpx' },
      nuclei: { run: 'nuclei', needs: ['naabu', 'httpx'] },
    });
  });

  it('keys a tool used in two categories by category', () => {
    const jobs = buildPipelineJobs([
      { run: 'nmap', category: ToolCategory.PORTS_SCANNER },
      { run: 'nmap', category: ToolCategory.VULNERABILITIES, stage: 2 },
    ]);
    expect(Object.keys(jobs)).toEqual([
      `nmap_${ToolCategory.PORTS_SCANNER}`,
      `nmap_${ToolCategory.VULNERABILITIES}`,
    ]);
    expect(jobs[`nmap_${ToolCategory.VULNERABILITIES}`].needs).toEqual([
      `nmap_${ToolCategory.PORTS_SCANNER}`,
    ]);
  });

  it('keeps config and profile references', () => {
    expect(
      buildPipelineJobs([
        { run: 'gitleaks', config: { scanHistory: false }, configProfileId: 'p-1' },
      ]),
    ).toEqual({
      gitleaks: {
        run: 'gitleaks',
        config: { scanHistory: false },
        configProfileId: 'p-1',
      },
    });
  });
});

describe('pipelineStages', () => {
  it('layers a DAG by its deepest dependency', () => {
    const stages = pipelineStages({
      scan_subdomain: {},
      port_scan: { needs: ['scan_subdomain'] },
      http_probe: { needs: ['port_scan'] },
      screenshot: { needs: ['http_probe', 'scan_subdomain'] },
    });
    expect(Object.fromEntries(stages)).toEqual({
      scan_subdomain: 1,
      port_scan: 2,
      http_probe: 3,
      screenshot: 4,
    });
  });

  it('round-trips a staged pipeline', () => {
    const jobs = buildPipelineJobs([
      { run: 'a' },
      { run: 'b', stage: 2 },
      { run: 'c', stage: 2 },
      { run: 'd', stage: 3 },
    ]);
    expect(Object.fromEntries(pipelineStages(jobs))).toEqual({
      a: 1,
      b: 2,
      c: 2,
      d: 3,
    });
  });
});

describe('isProjectOwnedWorkflow', () => {
  it.each([
    ['project-p1-0b6c.yaml', true],
    ['group-p1.yaml', true],
    ['group-p10.yaml', false],
    ['project-p10-0b6c.yaml', false],
    ['domain_discovery.yaml', false],
    [undefined, false],
  ])('%s → %s', (filePath, owned) => {
    expect(isProjectOwnedWorkflow(filePath, 'p1')).toBe(owned);
  });
});
