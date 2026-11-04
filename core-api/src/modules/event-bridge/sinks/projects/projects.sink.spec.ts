import { EventBusGroup } from '@/common/enums/enum';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { ProjectsSink } from './projects.sink';

const event = (payload: unknown): ConsumedEvent => ({
  eventId: 'e-1',
  workspaceId: 'ws-1',
  payload,
});

describe('ProjectsSink', () => {
  const projects = { addDiscoveredAssets: jest.fn() };
  const sink = new ProjectsSink(projects);

  beforeEach(() => jest.clearAllMocks());

  it('is the projects lane and only takes asset.discovered', () => {
    expect(sink.group).toBe(EventBusGroup.Projects);
    expect(sink.accepts('asset.discovered')).toBe(true);
    expect(sink.accepts('asset.deleted')).toBe(false);
    expect(sink.accepts('asset.url.discovered')).toBe(false);
  });

  it('hands the batch to the projects of the workspace', async () => {
    await sink.handle(
      'asset.discovered',
      event({ targetId: 't-1', assetIds: ['a-1', 'a-2'] }),
    );
    expect(projects.addDiscoveredAssets).toHaveBeenCalledWith('ws-1', [
      'a-1',
      'a-2',
    ]);
  });

  it('ignores a payload without asset ids', async () => {
    await sink.handle('asset.discovered', event({ targetId: 't-1' }));
    await sink.handle('asset.discovered', event(null));
    expect(projects.addDiscoveredAssets).not.toHaveBeenCalled();
  });
});
