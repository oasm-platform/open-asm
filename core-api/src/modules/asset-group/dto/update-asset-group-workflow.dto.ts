import { PickType } from '@nestjs/swagger';
import { AssetGroupWorkflow } from '../entities/asset-groups-workflows.entity';

export class UpdateAssetGroupWorkflowDto extends PickType(AssetGroupWorkflow, ['schedule']) { }
