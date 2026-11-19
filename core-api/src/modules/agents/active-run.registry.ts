import { Injectable } from '@nestjs/common';

/**
 * Active streaming runs by conversation id, in this process. A run outlives
 * the HTTP request that started it (so navigating away does not kill it);
 * only an explicit stop, or a newer run on the same conversation, aborts it.
 */
@Injectable()
export class ActiveRunRegistry {
  private readonly runs = new Map<string, AbortController>();

  /** Registers the run so a later stop can find it; supersedes any older run. */
  register(conversationId: string, controller: AbortController): void {
    const previous = this.runs.get(conversationId);
    if (previous && previous !== controller) previous.abort();
    this.runs.set(conversationId, controller);
  }

  /** Unregisters the run, but only if it is still the current one. */
  clear(conversationId: string, controller: AbortController): void {
    if (this.runs.get(conversationId) === controller) {
      this.runs.delete(conversationId);
    }
  }

  /**
   * Aborts the conversation's run. False when there is none or it was
   * already aborted. The run stays registered (so `isActive` stays true)
   * until it has saved its stopped state and cleared itself.
   */
  abort(conversationId: string): boolean {
    const controller = this.runs.get(conversationId);
    if (!controller || controller.signal.aborted) return false;
    controller.abort();
    return true;
  }

  /**
   * True while a run of the conversation is in progress, including the gaps
   * between continuation iterations where no message is 'streaming'.
   */
  isActive(conversationId: string): boolean {
    return this.runs.has(conversationId);
  }
}
