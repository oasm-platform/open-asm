import { ProjectScopeRuleMode, ProjectScopeRuleType } from '@/common/enums/enum';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174001';

describe('CreateProjectDto', () => {
  it('accepts a full payload', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      hexColor: '#78716C',
      description: 'Public hosts',
      hostIds: [VALID_UUID],
      scopeRules: [
        {
          mode: ProjectScopeRuleMode.INCLUDE,
          type: ProjectScopeRuleType.HOSTNAME,
          value: '*.example.com',
        },
      ],
      tools: [{ toolId: VALID_UUID, stage: 2 }],
      schedule: '0 0 */3 * *',
      onAssetsAdded: { windowMinutes: 10, maxAssets: 200 },
      runNow: true,
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
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      hexColor,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([['99 99 99 99 99'], ['not a cron']])(
    'rejects invalid schedule "%s"',
    async (schedule) => {
      const dto = plainToInstance(CreateProjectDto, {
        name: 'Web Servers',
        schedule,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('rejects duplicate host IDs', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      hostIds: [VALID_UUID, VALID_UUID],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a scope rule with an unknown type', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      scopeRules: [{ mode: 'include', type: 'regex', value: '.*' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([[0], [21], [1.5]])('rejects pipeline stage %s', async (stage) => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      tools: [{ toolId: VALID_UUID, stage }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an "assets added" window over a day', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      name: 'Web Servers',
      onAssetsAdded: { windowMinutes: 1441 },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
