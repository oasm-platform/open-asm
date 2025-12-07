import { Logger } from '@nestjs/common';
import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { AssetGroupWorkflow } from './asset-groups-workflows.entity';

@EventSubscriber()
export class AssetGroupWorkflowSubscriber
  implements EntitySubscriberInterface<AssetGroupWorkflow>
{
  private readonly logger = new Logger(AssetGroupWorkflowSubscriber.name);

  /**
   * Indicates in which events this subscriber should be triggered
   */
  listenTo() {
    return AssetGroupWorkflow;
  }

  /**
   * Called before entity insertion
   */
  beforeInsert(event: InsertEvent<AssetGroupWorkflow>) {
    if (event.entity) {
      this.logger.log(
        `AssetGroupWorkflow insert event triggered for entity ID: ${event.entity.id}`,
      );
    }
    // You can access the entity through event.entity
    // Example:
    // event.entity.someProperty = 'defaultValue';
  }

  /**
   * Called before entity update
   */
  beforeUpdate(event: UpdateEvent<AssetGroupWorkflow>) {
    this.logger.log(
      `AssetGroupWorkflow update event triggered for entity ID: ${event.entity?.id || event.databaseEntity?.id}`,
    );
    // You can access the entity through event.entity and the database entity through event.databaseEntity
    // Example:
    // const recordId = event.entity?.id || event.databaseEntity?.id;
    // console.log('Updated columns:', event.updatedColumns);
    // console.log('Previous values:', event.databaseEntity);
    // console.log('New values:', event.entity);
  }

  /**
   * Called before entity removal
   */
  beforeRemove(event: RemoveEvent<AssetGroupWorkflow>) {
    if (event.entity) {
      this.logger.log(
        `AssetGroupWorkflow remove event triggered for entity ID: ${event.entity.id}`,
      );
    }
    // You can access the entity through event.entity
    // Example:
    // const recordId = event.entity.id;
    // const assetGroupId = event.entity.assetGroup?.id;
    // const workflowId = event.entity.workflow?.id;
  }
}
