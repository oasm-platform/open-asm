import { SetMetadata } from '@nestjs/common';

export const EVENT_LANE_METADATA = 'oasm:event-lane';

/**
 * Marks an {@link EventSink} provider as the consumer of one lane.
 * `EventConsumersService` finds every marked provider at boot, in whatever
 * module registers it, so a domain module can own its lane without the bridge
 * importing that module.
 */
export const EventLane = (): ClassDecorator => SetMetadata(EVENT_LANE_METADATA, true);
