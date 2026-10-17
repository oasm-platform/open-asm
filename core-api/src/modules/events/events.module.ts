import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * `GET /events/stream`: the one SSE connection the console keeps open. What
 * may go out is declared in `client-events.ts`.
 */
@Module({
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
