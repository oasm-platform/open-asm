import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SystemSettingsDto } from './system-configs.dto';

const errorsFor = async (allowedIps: unknown) => {
  const dto = plainToInstance(SystemSettingsDto, {
    adminAccess: { allowedIps },
  });
  return validate(dto, { whitelist: true });
};

describe('AdminAccessSettingsDto', () => {
  it('accepts addresses and CIDR ranges', async () => {
    await expect(
      errorsFor(['203.0.113.7', '10.0.0.0/8', '2001:db8::/32']),
    ).resolves.toHaveLength(0);
  });

  it('accepts an empty list', async () => {
    await expect(errorsFor([])).resolves.toHaveLength(0);
  });

  it('rejects an entry that is not an IP address or CIDR range', async () => {
    await expect(errorsFor(['203.0.113.7', 'example.com'])).resolves.not.toHaveLength(0);
    await expect(errorsFor(['10.0.0.0/33'])).resolves.not.toHaveLength(0);
  });

  it('rejects a value that is not a list', async () => {
    await expect(errorsFor('203.0.113.7')).resolves.not.toHaveLength(0);
  });
});
