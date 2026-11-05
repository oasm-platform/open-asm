import { DataKind, TargetType } from '@/common/enums/enum';
import {
  kindsToLoad,
  planStepInputs,
  webUrl,
  type ScopeAsset,
  type ScopeData,
} from './step-inputs';

const apex: ScopeAsset = {
  id: 'a-apex',
  value: 'example.com',
  isPrimary: true,
  targetType: TargetType.DOMAIN,
};
const app: ScopeAsset = {
  id: 'a-app',
  value: 'app.example.com',
  isPrimary: false,
  targetType: TargetType.DOMAIN,
};
const repo: ScopeAsset = {
  id: 'a-repo',
  value: 'github.com/acme/web',
  isPrimary: false,
  targetType: TargetType.GIT_ORG,
};

/** app.example.com: SSH on 22, a web app on 8443 and plain HTTP on 80. */
const scope: ScopeData = {
  assets: [apex, app, repo],
  services: new Map([
    [
      'a-app',
      [
        { id: 's-22', assetId: 'a-app', value: 'app.example.com:22', port: 22 },
        { id: 's-8443', assetId: 'a-app', value: 'app.example.com:8443', port: 8443 },
        { id: 's-80', assetId: 'a-app', value: 'app.example.com:80', port: 80 },
      ],
    ],
  ]),
  web: new Map([
    [
      'a-app',
      [
        { id: 's-8443', assetId: 'a-app', value: 'app.example.com:8443', port: 8443, scheme: 'https' },
        { id: 's-80', assetId: 'a-app', value: 'app.example.com:80', port: 80, scheme: 'http' },
      ],
    ],
  ]),
  urls: new Map([
    ['a-app', [{ url: 'https://app.example.com:8443/login', assetId: 'a-app', serviceId: 's-8443' }]],
  ]),
};

const targets = (kinds: DataKind[]) =>
  planStepInputs(kinds, scope).map((p) => p.connectorInputs?.target ?? `repo:${p.assetId}`);

describe('planStepInputs', () => {
  it('target: only the asset a target was created with', () => {
    expect(targets([DataKind.TARGET])).toEqual(['example.com']);
  });

  it('host: every host, never a repository', () => {
    expect(targets([DataKind.HOST])).toEqual(['example.com', 'app.example.com']);
  });

  it('service: every open port, whatever it speaks', () => {
    const planned = planStepInputs([DataKind.SERVICE], scope);
    expect(planned.map((p) => p.serviceId)).toEqual(['s-22', 's-8443', 's-80']);
    expect(planned[0].connectorInputs).toEqual({ target: 'app.example.com:22' });
    expect(planned[0].commandValues).toEqual({ value: 'app.example.com:22', port: '22' });
  });

  it('web: one job per web service, its URL in target with the port kept', () => {
    const planned = planStepInputs([DataKind.WEB], scope);
    expect(planned.map((p) => [p.serviceId, p.connectorInputs])).toEqual([
      ['s-8443', { target: 'https://app.example.com:8443' }],
      ['s-80', { target: 'http://app.example.com' }],
    ]);
  });

  it('url: one job per discovered URL, on the service it was found on', () => {
    const planned = planStepInputs([DataKind.URL], scope);
    expect(planned).toEqual([
      expect.objectContaining({
        assetId: 'a-app',
        serviceId: 's-8443',
        connectorInputs: { target: 'https://app.example.com:8443/login' },
      }),
    ]);
  });

  it('repository: the repositories, with inputs left to the claim (credentials)', () => {
    expect(planStepInputs([DataKind.REPOSITORY], scope)).toEqual([
      expect.objectContaining({ assetId: 'a-repo', connectorInputs: null }),
    ]);
  });

  it('takes, per asset, the first kind that has something', () => {
    // app has web services: its URLs. The apex was never probed: the host.
    expect(targets([DataKind.WEB, DataKind.HOST])).toEqual([
      'example.com',
      'https://app.example.com:8443',
      'http://app.example.com',
    ]);
  });

  it('plans nothing when no asset has the kind (the step is skipped)', () => {
    expect(planStepInputs([DataKind.WEB], { assets: [apex] })).toEqual([]);
  });

  it('never takes vulnerabilities as input', () => {
    expect(planStepInputs([DataKind.VULNERABILITY], scope)).toEqual([]);
  });
});

describe('webUrl', () => {
  it('drops the default port of the scheme', () => {
    expect(webUrl('h', 'https', 443)).toBe('https://h');
    expect(webUrl('h', 'http', 80)).toBe('http://h');
    expect(webUrl('h', 'http', 443)).toBe('http://h:443');
  });
});

describe('kindsToLoad', () => {
  it('loads services, web services and URLs only when asked for', () => {
    expect(kindsToLoad([DataKind.HOST])).toEqual({ services: false, web: false, urls: false });
    expect(kindsToLoad([DataKind.WEB, DataKind.URL])).toEqual({
      services: false,
      web: true,
      urls: true,
    });
  });
});
