import { reportFileName } from './report-file-name';

describe('reportFileName', () => {
  const now = new Date('2026-11-27T14:30:59.000Z');

  it('names a summary report after the workspace, the report and the UTC minute', () => {
    expect(reportFileName({ workspaceName: 'Acme Corp', type: 'SUMMARY', now })).toBe(
      'acme-corp-attack-surface-summary-2026-11-27-1430.pdf',
    );
  });

  it('names a vulnerability report', () => {
    expect(reportFileName({ workspaceName: 'Acme Corp', type: 'VULNERABILITY', now })).toBe(
      'acme-corp-vulnerability-report-2026-11-27-1430.pdf',
    );
  });

  it('names a query report after its saved query', () => {
    expect(
      reportFileName({ workspaceName: 'Acme Corp', type: 'QUERY', title: 'Open ports (prod)', now }),
    ).toBe('acme-corp-open-ports-prod-2026-11-27-1430.pdf');
  });

  it('falls back to "query-report" when the saved query name has nothing usable', () => {
    expect(reportFileName({ workspaceName: 'Acme', type: 'QUERY', title: '🔥🔥', now })).toBe(
      'acme-query-report-2026-11-27-1430.pdf',
    );
  });

  it('strips Vietnamese diacritics, including đ', () => {
    expect(reportFileName({ workspaceName: 'Công ty Đà Nẵng', type: 'SUMMARY', now })).toBe(
      'cong-ty-da-nang-attack-surface-summary-2026-11-27-1430.pdf',
    );
  });

  it('drops the workspace part when its name has no latin characters', () => {
    expect(reportFileName({ workspaceName: '東京チーム', type: 'VULNERABILITY', now })).toBe(
      'vulnerability-report-2026-11-27-1430.pdf',
    );
  });

  it('keeps path separators and dot runs out of the name', () => {
    const name = reportFileName({ workspaceName: '../../etc', type: 'QUERY', title: 'a/b\\c..d', now });
    expect(name).toBe('etc-a-b-c-d-2026-11-27-1430.pdf');
    expect(name).not.toMatch(/[/\\]|\.\./);
  });

  it('caps long workspace and query names', () => {
    const name = reportFileName({ workspaceName: 'w'.repeat(200), type: 'QUERY', title: 'q'.repeat(200), now });
    expect(name).toBe(`${'w'.repeat(40)}-${'q'.repeat(60)}-2026-11-27-1430.pdf`);
  });

  it('never ends a capped part on a hyphen', () => {
    const name = reportFileName({ workspaceName: `${'a'.repeat(39)} b`, type: 'SUMMARY', now });
    expect(name).toBe(`${'a'.repeat(39)}-attack-surface-summary-2026-11-27-1430.pdf`);
  });
});
