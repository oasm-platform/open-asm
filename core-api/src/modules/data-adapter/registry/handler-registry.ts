import { Injectable, Inject, Optional, OnModuleInit, Logger } from '@nestjs/common';
import { ToolCategory } from '../../../common/enums/enum';
import type { IDataHandler } from '../handlers/interfaces/data-handler.interface';

/**
 * Custom injection token used by every data-adapter handler.
 * Used as a multi-provider token so NestJS collects all handlers into an array.
 */
export const DATA_HANDLER_TOKEN = 'DATA_HANDLER';

/**
 * Registry that maps ToolCategory → IDataHandler.
 *
 * Handlers are injected at construction via NestJS multi-provider DI array.
 * If a category has no handler, the application will fail at startup
 * (fail-fast), preventing runtime routing errors.
 */
@Injectable()
export class HandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger(HandlerRegistry.name);
  private readonly handlerMap = new Map<ToolCategory, IDataHandler>();

  constructor(
    @Inject(DATA_HANDLER_TOKEN)
    @Optional()
    private readonly handlers: IDataHandler[] = [],
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.validateCoverage();
  }

  private registerHandlers(): void {
    for (const handler of this.handlers) {
      const existing = this.handlerMap.get(handler.category);
      if (existing) {
        this.logger.warn(
          `Duplicate handler for ${handler.category}: ` +
            `${handler.constructor.name} overrides ${existing.constructor.name}`,
        );
      }
      this.handlerMap.set(handler.category, handler);
      this.logger.log(
        `Registered: ${handler.constructor.name} → ${handler.category}`,
      );
    }
  }

  private validateCoverage(): void {
    const categories = Object.values(ToolCategory);
    for (const cat of categories) {
      if (!this.handlerMap.has(cat)) {
        throw new Error(
          `[HandlerRegistry] Missing handler for ToolCategory.${cat}. ` +
            'Every category must have exactly one handler registered.',
        );
      }
    }
  }

  /**
   * Look up a handler by tool category.
   * Throws at runtime if the category has no handler (should never happen
   * after startup validation passes).
   */
  get(category: ToolCategory): IDataHandler {
    const handler = this.handlerMap.get(category);
    if (!handler) {
      throw new Error(`No handler registered for category: ${category}`);
    }
    return handler;
  }
}
