import { PickType } from '@nestjs/swagger';
import { Workspace } from '../entities/workspace.entity';

export class UpdateWorkspaceConfigsDto extends PickType(Workspace, ['isAutoEnableAssetAfterDiscovered', 'isAssetsDiscovery'] as const) {

}