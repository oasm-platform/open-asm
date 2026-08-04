import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAssetGroupDto } from './create-asset-group.dto';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174001';

describe('CreateAssetGroupDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      hexColor: '#78716C',
      hostIds: [VALID_UUID],
      toolIds: [VALID_UUID],
      schedule: '0 0 */3 * *',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['#78716', 'short hex'],
    ['#78716G', 'invalid hex char'],
    ['78716C', 'missing hash'],
    ['#78716CCC', 'too long'],
  ])('rejects hexColor "%s" (%s)', async (hexColor) => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      hexColor,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    ['99 99 99 99 99'],
    ['not a cron'],
  ])('rejects invalid schedule "%s"', async (schedule) => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      schedule,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts "disabled" as a schedule', async () => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      schedule: 'disabled',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects duplicate host IDs', async () => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      hostIds: [VALID_UUID, VALID_UUID],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an oversized tool ID array', async () => {
    const dto = plainToInstance(CreateAssetGroupDto, {
      name: 'Web Servers',
      toolIds: Array.from({ length: 1001 }, (_, i) => {
        // Deterministic unique uuids
        const hex = i.toString(16).padStart(24, '0');
        return `${VALID_UUID.slice(0, 8)}-0000-4000-8000-${hex}`;
      }),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
