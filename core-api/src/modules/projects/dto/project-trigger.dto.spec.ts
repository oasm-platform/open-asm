import { ProjectTriggerType, TargetType } from '@/common/enums/enum';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProjectTriggerDto,
  UpdateProjectTriggerDto,
} from './project-trigger.dto';

const BINDING_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('UpdateProjectTriggerDto', () => {
  it.each([
    ['0 0 * * *'],
    ['30 14 * * 1,3'],
    ['*/15 8 * * *'],
    ['0 0 */3 * *'],
    ['0 9 * * 1-5'],
    ['0,1,2 * * * *'],
    ['*/99 * * * *'],
    ['0 0 * * 0,7'],
    ['5 4 * * 1-5/2'],
  ])('accepts cron "%s"', async (cron) => {
    const dto = plainToInstance(UpdateProjectTriggerDto, { cron });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['not a cron'],
    ['0 0 * *'],
    [''],
    ['99 99 99 99 99'],
    ['61 * * * *'],
    ['0 25 * * *'],
    ['0 0 32 * *'],
    ['1/5 * * * *'],
    ['5-1 * * * *'],
  ])('rejects cron "%s"', async (cron) => {
    const dto = plainToInstance(UpdateProjectTriggerDto, { cron });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateProjectTriggerDto', () => {
  it('accepts an "assets added" trigger limited to domains', async () => {
    const dto = plainToInstance(CreateProjectTriggerDto, {
      projectWorkflowId: BINDING_ID,
      type: ProjectTriggerType.ASSETS_ADDED,
      config: { windowMinutes: 0, maxAssets: 50, targetTypes: [TargetType.DOMAIN] },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    [{ maxAssets: 0 }],
    [{ maxAssets: 5001 }],
    [{ windowMinutes: -1 }],
    [{ targetTypes: ['WEBSITE'] }],
  ])('rejects config %j', async (config) => {
    const dto = plainToInstance(CreateProjectTriggerDto, {
      projectWorkflowId: BINDING_ID,
      type: ProjectTriggerType.ASSETS_ADDED,
      config,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
