import { TargetType } from '@/common/enums/enum';
import {
  DEFAULT_TOOL_TARGET_TYPES,
  parseManifestTargetTypes,
  resolveToolTargetTypes,
  sameTargetTypes,
  triggerTargetType,
} from './tool-target-types';

describe('tool target types', () => {
  describe('resolveToolTargetTypes', () => {
    it('falls back to the host default for tools without a declaration', () => {
      expect(resolveToolTargetTypes({})).toEqual(DEFAULT_TOOL_TARGET_TYPES);
      expect(resolveToolTargetTypes({ targetTypes: [] })).toEqual(
        DEFAULT_TOOL_TARGET_TYPES,
      );
    });

    it('keeps declared types and drops unknown values', () => {
      expect(
        resolveToolTargetTypes({ targetTypes: [TargetType.DOMAIN, 'BOGUS'] }),
      ).toEqual([TargetType.DOMAIN]);
    });
  });

  describe('parseManifestTargetTypes', () => {
    it('maps lowercase manifest values onto TargetType', () => {
      expect(parseManifestTargetTypes(['domain', 'ip', 'cidr'])).toEqual({
        targetTypes: [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR],
        unknown: [],
      });
    });

    it('reports values this platform does not know yet', () => {
      expect(parseManifestTargetTypes(['domain', 'future_type'])).toEqual({
        targetTypes: [TargetType.DOMAIN],
        unknown: ['future_type'],
      });
    });

    // Never a host default: a repository scanner that declares nothing usable
    // must not be handed IP targets. The caller skips an empty result.
    it('returns no target types when nothing usable is declared', () => {
      expect(parseManifestTargetTypes(undefined).targetTypes).toEqual([]);
      expect(parseManifestTargetTypes(['future_type']).targetTypes).toEqual([]);
    });
  });

  it('compares target type lists regardless of order', () => {
    expect(sameTargetTypes(['DOMAIN', 'IP'], ['IP', 'DOMAIN'])).toBe(true);
    expect(sameTargetTypes(['DOMAIN'], ['DOMAIN', 'IP'])).toBe(false);
    expect(sameTargetTypes(undefined, [])).toBe(true);
  });

  it('reads the target type of a workflow trigger', () => {
    expect(triggerTargetType('domain.create')).toBe(TargetType.DOMAIN);
    expect(triggerTargetType('cidr.re-scan')).toBe(TargetType.CIDR);
    expect(triggerTargetType('nonsense')).toBeUndefined();
  });
});
