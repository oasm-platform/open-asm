import { TargetType } from '@/common/enums/enum';
import {
  buildConnectorInputs,
  isRepositoryAsset,
  repositoryUsername,
} from './connector-inputs';

describe('connector inputs', () => {
  const repoAsset = {
    value: 'github.com/acme/web',
    metadata: {
      url: 'https://github.com/acme/web',
      defaultBranch: 'main',
    },
    target: { type: TargetType.GIT_ORG },
  };

  it('keeps host assets on the historical { target } input', () => {
    expect(
      buildConnectorInputs({ value: 'app.example.com', target: { type: TargetType.DOMAIN } }),
    ).toEqual({ target: 'app.example.com' });
  });

  it('sends the repository contract for repository assets', () => {
    expect(isRepositoryAsset(repoAsset)).toBe(true);
    expect(buildConnectorInputs(repoAsset)).toEqual({
      repository: 'https://github.com/acme/web',
      ref: 'main',
    });
  });

  it('attaches credentials only when a token was resolved', () => {
    expect(
      buildConnectorInputs(repoAsset, { username: 'x-access-token', token: 'ghp_x' }),
    ).toEqual({
      repository: 'https://github.com/acme/web',
      ref: 'main',
      username: 'x-access-token',
      token: 'ghp_x',
    });
    expect(buildConnectorInputs(repoAsset, { username: 'u', token: '' })).not.toHaveProperty(
      'token',
    );
  });

  it('falls back to the asset value when metadata is missing', () => {
    expect(
      buildConnectorInputs({ value: 'gitlab.com/acme/web', target: { type: TargetType.GIT_ORG } }),
    ).toEqual({ repository: 'https://gitlab.com/acme/web', ref: '' });
  });

  it('uses the basic-auth user each provider accepts with a token', () => {
    expect(repositoryUsername('github')).toBe('x-access-token');
    expect(repositoryUsername('gitlab')).toBe('oauth2');
  });
});
