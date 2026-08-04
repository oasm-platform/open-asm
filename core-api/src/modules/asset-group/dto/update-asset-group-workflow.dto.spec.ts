import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAssetGroupWorkflowDto } from './update-asset-group-workflow.dto';

describe('UpdateAssetGroupWorkflowDto', () => {
  it.each([
    ['0 0 * * *'],
    ['30 14 * * 1,3'],
    ['*/15 8 * * *'],
    ['0 0 */3 * *'],
    ['disabled'],
    ['0 9 * * 1-5'],
    ['0,1,2 * * * *'],
    ['*/99 * * * *'],
    ['0 0 * * 0,7'],
    ['5 4 * * 1-5/2'],
  ])('accepts schedule "%s"', async (schedule) => {
    const dto = plainToInstance(UpdateAssetGroupWorkflowDto, { schedule });
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
  ])('rejects schedule "%s"', async (schedule) => {
    const dto = plainToInstance(UpdateAssetGroupWorkflowDto, { schedule });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
