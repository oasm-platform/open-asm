import { DataKind, TargetType, ToolCategory } from '@/common/enums/enum';
import {
  capabilityInputs,
  defaultInputs,
  defaultProduces,
  parseKinds,
  PRODUCED_KINDS,
  resolveStepInputs,
} from './tool-io';

const HOST = [TargetType.DOMAIN, TargetType.IP, TargetType.CIDR];

describe('defaultInputs', () => {
  it.each([
    [ToolCategory.SUBDOMAINS, [DataKind.TARGET]],
    [ToolCategory.PORTS_SCANNER, [DataKind.HOST]],
    [ToolCategory.HTTP_PROBE, [DataKind.SERVICE]],
    [ToolCategory.SCREENSHOT, [DataKind.WEB]],
    [ToolCategory.URL_DISCOVERY, [DataKind.WEB]],
    [ToolCategory.VULNERABILITIES, [DataKind.HOST]],
  ])('%s takes what it was always dispatched', (category, inputs) => {
    expect(defaultInputs(category, HOST)).toEqual(inputs);
  });

  it('gives a scanner of Git organizations repositories', () => {
    expect(
      defaultInputs(ToolCategory.VULNERABILITIES, [TargetType.GIT_ORG]),
    ).toEqual([DataKind.REPOSITORY]);
  });
});

describe('defaultProduces', () => {
  it.each([
    [ToolCategory.SUBDOMAINS, [DataKind.HOST]],
    [ToolCategory.PORTS_SCANNER, [DataKind.SERVICE]],
    [ToolCategory.HTTP_PROBE, [DataKind.WEB]],
    [ToolCategory.SCREENSHOT, []],
    [ToolCategory.URL_DISCOVERY, [DataKind.URL]],
    [ToolCategory.VULNERABILITIES, [DataKind.VULNERABILITY]],
  ])('%s → %j', (category, produces) => {
    expect(defaultProduces(category)).toEqual(produces);
  });
});

describe('parseKinds', () => {
  it('keeps order, lowercases, drops duplicates and reports unknown kinds', () => {
    expect(
      parseKinds(['URL', 'vulnerability', 'url', 'target'], PRODUCED_KINDS),
    ).toEqual({
      kinds: [DataKind.URL, DataKind.VULNERABILITY],
      unknown: ['target'],
    });
  });

  it('reads anything that is not a list as nothing', () => {
    expect(parseKinds('web', PRODUCED_KINDS)).toEqual({ kinds: [], unknown: [] });
  });
});

describe('resolveStepInputs', () => {
  const nikto = {
    name: ToolCategory.VULNERABILITIES,
    targetTypes: HOST,
    inputs: [DataKind.WEB, DataKind.HOST],
  };

  it("uses the capability's inputs when the step sets none", () => {
    expect(resolveStepInputs('nikto', nikto)).toEqual([DataKind.WEB, DataKind.HOST]);
  });

  it('lets a step narrow or reorder them', () => {
    expect(resolveStepInputs('nikto', nikto, [DataKind.HOST, DataKind.WEB])).toEqual([
      DataKind.HOST,
      DataKind.WEB,
    ]);
    expect(resolveStepInputs('nikto', nikto, [DataKind.WEB])).toEqual([DataKind.WEB]);
  });

  it('rejects a kind the capability does not take', () => {
    expect(() => resolveStepInputs('nikto', nikto, [DataKind.URL])).toThrow(
      '"nikto" (vulnerabilities) takes web, host; it cannot take url',
    );
  });

  it('falls back to the category defaults for a capability stored without inputs', () => {
    expect(
      capabilityInputs({ name: ToolCategory.HTTP_PROBE, targetTypes: HOST }),
    ).toEqual([DataKind.SERVICE]);
  });
});
