import { Global, Module, OnModuleInit } from '@nestjs/common';
import { EventHubService } from './event-hub.service';

@Global()
@Module({
  providers: [EventHubService],
  exports: [EventHubService],
})
export class EventHubModule implements OnModuleInit {
  constructor(private readonly eventHubService: EventHubService) {}

  async onModuleInit(): Promise<void> {
    await this.eventHubService.initConsumerGroups();
  }
}
