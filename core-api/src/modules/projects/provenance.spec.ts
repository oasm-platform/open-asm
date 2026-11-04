import { classifyProvenance, VulnerabilityProvenance } from './provenance';

const at = (iso: string) => new Date(iso);

describe('classifyProvenance', () => {
  it('is new when one run reported it and nothing scanned it since', () => {
    expect(
      classifyProvenance({
        timesSeen: 1,
        lastSeenRunId: 'r1',
        lastSeenAt: at('2026-11-01T02:05:00Z'),
        referenceRunId: 'r1',
        referenceRunAt: at('2026-11-01T02:00:00Z'),
      }),
    ).toBe(VulnerabilityProvenance.NEW);
  });

  it('is recurring when later runs reported it again', () => {
    expect(
      classifyProvenance({
        timesSeen: 4,
        lastSeenRunId: 'r4',
        lastSeenAt: at('2026-11-03T02:05:00Z'),
        referenceRunId: 'r4',
        referenceRunAt: at('2026-11-03T02:00:00Z'),
      }),
    ).toBe(VulnerabilityProvenance.RECURRING);
  });

  it('is not seen when a later run scanned the asset with the same tool and did not report it', () => {
    expect(
      classifyProvenance({
        timesSeen: 4,
        lastSeenRunId: 'r4',
        lastSeenAt: at('2026-11-03T02:05:00Z'),
        referenceRunId: 'r5',
        referenceRunAt: at('2026-11-04T02:00:00Z'),
      }),
    ).toBe(VulnerabilityProvenance.NOT_SEEN);
  });

  it('ignores a partial run that never scanned the asset (no reference run)', () => {
    // An "assets added" run of six other hosts leaves this vulnerability's
    // reference run unchanged, so it keeps its provenance.
    expect(
      classifyProvenance({
        timesSeen: 2,
        lastSeenRunId: 'r2',
        lastSeenAt: at('2026-11-02T02:05:00Z'),
        referenceRunId: null,
        referenceRunAt: null,
      }),
    ).toBe(VulnerabilityProvenance.RECURRING);
  });

  it('does not call a concurrent run that started earlier a miss', () => {
    expect(
      classifyProvenance({
        timesSeen: 1,
        lastSeenRunId: 'r2',
        lastSeenAt: at('2026-11-02T02:05:00Z'),
        referenceRunId: 'r1',
        referenceRunAt: at('2026-11-02T01:00:00Z'),
      }),
    ).toBe(VulnerabilityProvenance.NEW);
  });
});
