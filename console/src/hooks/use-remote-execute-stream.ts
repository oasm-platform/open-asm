import { useCallback, useState } from 'react';

export interface RemoteExecuteStreamEvent {
  toolCallId: string;
  type: number;
  data: string;
  exitCode?: number;
}

export function useRemoteExecuteStream() {
  const [eventsMap, setEventsMap] = useState<
    Map<string, RemoteExecuteStreamEvent[]>
  >(new Map());

  const appendEvent = useCallback((event: RemoteExecuteStreamEvent) => {
    setEventsMap((prev) => {
      const next = new Map(prev);
      const events = next.get(event.toolCallId) || [];
      next.set(event.toolCallId, [...events, event]);
      return next;
    });
  }, []);

  const getOutput = useCallback(
    (toolCallId: string): string => {
      const events = eventsMap.get(toolCallId) || [];
      return events
        .filter((e) => e.type === 1 || e.type === 2)
        .map((e) => e.data)
        .join('');
    },
    [eventsMap],
  );

  const isStreaming = useCallback(
    (toolCallId: string): boolean => {
      const events = eventsMap.get(toolCallId) || [];
      return !events.some((e) => e.type === 3 || e.type === 4);
    },
    [eventsMap],
  );

  const getExitCode = useCallback(
    (toolCallId: string): number | null => {
      const events = eventsMap.get(toolCallId) || [];
      const exit = events.find((e) => e.type === 3);
      return exit?.exitCode ?? null;
    },
    [eventsMap],
  );

  return { appendEvent, getOutput, isStreaming, getExitCode, eventsMap };
}
