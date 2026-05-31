import { parseCVSS } from '@/utils/cvssVectorParser';

describe('parseCVSS', () => {
  it('returns null for non-string input', () => {
    expect(parseCVSS(null as unknown as string)).toBeNull();
    expect(parseCVSS(undefined as unknown as string)).toBeNull();
    expect(parseCVSS(123 as unknown as string)).toBeNull();
  });

  it('returns result with empty fields for empty string', () => {
    const result = parseCVSS('');
    expect(result).not.toBeNull();
    expect(result!.version).toBe('2.0');
    expect(result!.raw).toEqual({});
    expect(result!.detailed).toEqual({});
    expect(result!.normalized).toEqual({});
  });

  describe('CVSS 2.0', () => {
    it('parses a CVSS 2.0 vector', () => {
      const result = parseCVSS('AV:N/AC:L/Au:N/C:P/I:P/A:N');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('2.0');
      expect(result!.raw).toEqual({
        AV: 'N',
        AC: 'L',
        Au: 'N',
        C: 'P',
        I: 'P',
        A: 'N',
      });
    });

    it('maps raw keys to detailed metrics', () => {
      const result = parseCVSS('AV:N/AC:L/Au:N/C:P/I:P/A:N')!;
      expect(result.detailed.AV).toEqual({ value: 'N', name: 'Network' });
      expect(result.detailed.AC).toEqual({ value: 'L', name: 'Low' });
      expect(result.detailed.C).toEqual({ value: 'P', name: 'Unknown' });
    });

    it('normalizes keys using semantic names', () => {
      const result = parseCVSS('AV:N/AC:L/Au:N/C:P/I:P/A:N')!;
      expect(result.normalized.attackVector).toEqual({ value: 'N', name: 'Network' });
      expect(result.normalized.attackComplexity).toEqual({ value: 'L', name: 'Low' });
      expect(result.normalized.confidentiality).toEqual({ value: 'P', name: 'Unknown' });
    });
  });

  describe('CVSS 3.0', () => {
    it('detects CVSS 3.0 prefix', () => {
      const result = parseCVSS('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('3.0');
    });

    it('parses all standard v3 metrics', () => {
      const result = parseCVSS('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')!;
      expect(result.raw.AV).toBe('N');
      expect(result.raw.AC).toBe('L');
      expect(result.raw.PR).toBe('N');
      expect(result.raw.UI).toBe('N');
      expect(result.raw.S).toBe('U');
      expect(result.raw.C).toBe('H');
      expect(result.raw.I).toBe('H');
      expect(result.raw.A).toBe('H');
    });
  });

  describe('CVSS 3.1', () => {
    it('detects CVSS 3.1 prefix', () => {
      const result = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('3.1');
    });
  });

  describe('CVSS 4.0', () => {
    it('detects CVSS 4.0 prefix', () => {
      const result = parseCVSS('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('4.0');
    });

    it('parses v4-specific metrics', () => {
      const result = parseCVSS('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N')!;
      expect(result.raw.AT).toBe('N');
      expect(result.raw.VC).toBe('H');
      expect(result.raw.VI).toBe('H');
      expect(result.raw.VA).toBe('H');
      expect(result.raw.SC).toBe('N');
      expect(result.raw.SI).toBe('N');
      expect(result.raw.SA).toBe('N');
    });

    it('normalizes v4-specific metric names', () => {
      const result = parseCVSS('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N')!;
      expect(result.normalized.attackRequirements).toEqual({ value: 'N', name: 'None' });
      expect(result.normalized.vulnConfidentiality).toEqual({ value: 'H', name: 'High' });
      expect(result.normalized.sysConfidentiality).toEqual({ value: 'N', name: 'None' });
    });
  });

  describe('metric value resolution', () => {
    it('resolves Attack Vector values', () => {
      const network = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(network.detailed.AV.name).toBe('Network');

      const adjacent = parseCVSS('CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(adjacent.detailed.AV.name).toBe('Adjacent');

      const local = parseCVSS('CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(local.detailed.AV.name).toBe('Local');

      const physical = parseCVSS('CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(physical.detailed.AV.name).toBe('Physical');
    });

    it('resolves Attack Complexity values', () => {
      const low = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(low.detailed.AC.name).toBe('Low');

      const high = parseCVSS('CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(high.detailed.AC.name).toBe('High');
    });

    it('resolves Scope values', () => {
      const unchanged = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(unchanged.detailed.S.name).toBe('Unchanged');

      const changed = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:N')!;
      expect(changed.detailed.S.name).toBe('Changed');
    });

    it('resolves User Interaction values', () => {
      const none = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(none.detailed.UI.name).toBe('None');

      const required = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:N')!;
      expect(required.detailed.UI.name).toBe('Required');
    });

    it('returns Unknown for unrecognized values', () => {
      const result = parseCVSS('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(result.detailed.AV.name).toBe('Unknown');
    });
  });

  describe('edge cases', () => {
    it('handles vector without prefix', () => {
      const result = parseCVSS('AV:N/AC:L/Au:N/C:P/I:P/A:N');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('2.0');
    });

    it('skips malformed parts', () => {
      const result = parseCVSS('CVSS:3.1/AV:N/invalid/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')!;
      expect(result.raw.AV).toBe('N');
      expect(result.raw.AC).toBe('L');
      expect(Object.keys(result.raw)).not.toContain('invalid');
    });

    it('preserves unknown metric keys in normalized', () => {
      const result = parseCVSS('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N/E:X')!;
      expect(result.normalized.E).toEqual({ value: 'X', name: 'Unknown' });
    });
  });
});
