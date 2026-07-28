import { Global, Module } from '@nestjs/common';
import { DataAdapterService } from './data-adapter.service';
import {
  HandlerRegistry,
  DATA_HANDLER_TOKEN,
} from './registry/handler-registry';
import { SubdomainHandler } from './handlers/subdomain.handler';
import { HttpResponseHandler } from './handlers/http-response.handler';
import { PortsScannerHandler } from './handlers/ports-scanner.handler';
import { VulnerabilityHandler } from './handlers/vulnerability.handler';
import { ScreenshotHandler } from './handlers/screenshot.handler';
import { VulnerabilityNotificationConsumer } from './domain-events/consumers/vulnerability-notification.consumer';

const handlerProviders = [
  SubdomainHandler,
  HttpResponseHandler,
  PortsScannerHandler,
  VulnerabilityHandler,
  ScreenshotHandler,
];

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    DataAdapterService,
    HandlerRegistry,
    VulnerabilityNotificationConsumer,
    ...handlerProviders,
    // Multi-provider: every handler registers itself for DI-based discovery
    ...handlerProviders.map((handler) => ({
      provide: DATA_HANDLER_TOKEN,
      useExisting: handler,
      multi: true,
    })),
  ],
  exports: [DataAdapterService],
})
export class DataAdapterModule {}
