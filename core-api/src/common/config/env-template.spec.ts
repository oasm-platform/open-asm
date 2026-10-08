import { readFileSync } from 'fs';
import { join } from 'path';

// process.cwd() is core-api when Jest runs, so paths stay valid there.
function readRepoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('env-template consistency guard', () => {
  it('assigns all seven canonical environment keys', () => {
    const template = readRepoFile('example.env');
    for (const key of [
      'CORS_ALLOWED_ORIGINS',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_PUBLIC_ENDPOINT',
      'RUSTFS_ENDPOINT',
      'BASE_URL',
      'WORKER_SIGNATURE',
    ]) {
      expect(template).toMatch(new RegExp(`^${key}=`, 'm'));
    }
  });

  it('rejects wildcard CORS regressions', () => {
    expect(readRepoFile('src/bootstrap/configure-app.ts')).not.toContain(
      'origin: true',
    );
    expect(readRepoFile('src/modules/auth/auth.ts')).not.toContain(
      "trustedOrigins: ['*']",
    );
  });
});
