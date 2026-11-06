import { IssueStatus } from '@/common/enums/enum';
import { IssueRulesController, IssuesController } from './issues.controller';
import { IssuesModule } from './issues.module';

describe('Issues controllers', () => {
  it('registers the rules controller before the issue routes', () => {
    // `/issues/rules` would otherwise be matched by `GET /issues/:id`.
    const controllers = Reflect.getMetadata('controllers', IssuesModule) as unknown[];
    expect(controllers.indexOf(IssueRulesController)).toBeLessThan(
      controllers.indexOf(IssuesController),
    );
  });

  it('passes the caller to the service', async () => {
    const service = {
      getMany: jest.fn(),
      changeStatus: jest.fn(),
    };
    const controller = new IssuesController(service as never);
    const user = { id: 'u-1' } as never;
    await controller.getMany({ mine: true } as never, user, 'ws-1');
    expect(service.getMany).toHaveBeenCalledWith({ mine: true }, 'ws-1', 'u-1');
    await controller.changeStatus(
      'i-1',
      { status: IssueStatus.IN_PROGRESS },
      user,
      'ws-1',
    );
    expect(service.changeStatus).toHaveBeenCalledWith(
      'i-1',
      { status: IssueStatus.IN_PROGRESS },
      'u-1',
      'ws-1',
    );
  });

  it('installs default rules for the caller’s workspace', async () => {
    const rules = { createDefaults: jest.fn() };
    const controller = new IssueRulesController(rules as never);
    await controller.createDefaultRules({ id: 'u-1' } as never, 'ws-1');
    expect(rules.createDefaults).toHaveBeenCalledWith('ws-1', 'u-1');
  });
});
