import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateIntegrationDto } from './create-integration.dto';
import { GetIntegrationDto } from './get-integration.dto';
import { UpdateIntegrationDto } from './update-integration.dto';

const validBase = {
  name: 'Cloudflare',
  appType: 'cloudflare',
  category: 'CLOUD_PROVIDER',
  config: { apiToken: 'test-token' },
};

describe('Integration schedule DTOs', () => {
  describe('CreateIntegrationDto.syncSchedule', () => {
    // SC-DTO-1: 5-field cron accepted
    it.each([
      ['0 0 * * *'],
      ['*/15 8 * * *'],
      ['0 0 * * 1-5'],
    ])('accepts syncSchedule "%s" with 0 validation errors', async (syncSchedule) => {
      const dto = plainToInstance(CreateIntegrationDto, {
        ...validBase,
        syncSchedule,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    // SC-DTO-2: 'disabled' accepted
    it('accepts syncSchedule "disabled" with 0 validation errors', async () => {
      const dto = plainToInstance(CreateIntegrationDto, {
        ...validBase,
        syncSchedule: 'disabled',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('UpdateIntegrationDto.syncSchedule', () => {
    it.each([['0 0 * * *'], ['disabled']])(
      'accepts syncSchedule "%s" with 0 validation errors',
      async (syncSchedule) => {
        const dto = plainToInstance(UpdateIntegrationDto, { syncSchedule });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      },
    );

    it('is optional — omitting it yields 0 validation errors', async () => {
      const dto = plainToInstance(UpdateIntegrationDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    // SC-DTO-OMIT: explicit undefined behaves like omission (200 no-op)
    it('SC-DTO-OMIT: syncSchedule: undefined yields 0 validation errors', async () => {
      const dto = plainToInstance(UpdateIntegrationDto, {
        syncSchedule: undefined,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    // SC-DTO-NULL: null is an explicit value, not an omission → 400
    it('SC-DTO-NULL: syncSchedule: null is rejected with an error on syncSchedule', async () => {
      const dto = plainToInstance(UpdateIntegrationDto, { syncSchedule: null });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('syncSchedule');
    });
  });

  describe('SC-DTO-3 — invalid cron rejected', () => {
    it('rejects syncSchedule "not-a-cron" on CreateIntegrationDto with an error on syncSchedule', async () => {
      const dto = plainToInstance(CreateIntegrationDto, {
        ...validBase,
        syncSchedule: 'not-a-cron',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('syncSchedule');
    });

    it('rejects syncSchedule "not-a-cron" on UpdateIntegrationDto with an error on syncSchedule', async () => {
      const dto = plainToInstance(UpdateIntegrationDto, {
        syncSchedule: 'not-a-cron',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('syncSchedule');
    });
  });

  describe('SC-DTO-4 — GetIntegrationDto exposes schedule fields, hides syncJobId', () => {
    it('exposes syncSchedule and lastRunAt on the class instance', () => {
      const dto = new GetIntegrationDto();
      dto.syncSchedule = '0 0 * * *';
      dto.lastRunAt = new Date('2026-08-09T00:00:00.000Z');
      expect(dto.syncSchedule).toBe('0 0 * * *');
      expect(dto.lastRunAt).toBeInstanceOf(Date);
    });

    it('does NOT expose syncJobId on the class instance', () => {
      const dto = new GetIntegrationDto();
      expect('syncJobId' in dto).toBe(false);
    });
  });
});
