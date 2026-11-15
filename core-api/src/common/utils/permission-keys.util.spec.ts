import { firstMissingPermission } from './permission-keys.util';

describe('firstMissingPermission', () => {
  it('passes when every required key is held', () => {
    expect(
      firstMissingPermission(['target.read', 'asset.read'], ['target.read']),
    ).toBeNull();
  });

  it('passes every key with the wildcard', () => {
    expect(firstMissingPermission(['*'], ['target.write', 'job.read'])).toBeNull();
  });

  it('lets {domain}.write satisfy {domain}.read', () => {
    expect(firstMissingPermission(['target.write'], ['target.read'])).toBeNull();
  });

  it('does not let {domain}.read satisfy {domain}.write', () => {
    expect(firstMissingPermission(['target.read'], ['target.write'])).toBe(
      'target.write',
    );
  });

  it('returns the first key that is missing', () => {
    expect(
      firstMissingPermission(['asset.read'], ['asset.read', 'job.read', 'worker.read']),
    ).toBe('job.read');
  });

  it('passes when nothing is required', () => {
    expect(firstMissingPermission([], [])).toBeNull();
  });
});
