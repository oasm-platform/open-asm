import { useEffect, useRef } from 'react';

export function useSse<T>(url: string, onMessage: (data: T) => void) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch (error) {
        console.error('Error parsing SSE data', error);
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CONNECTING) {
        eventSource.close();
      }
    };

    return () => {
      eventSource.close();
    };
  }, [url]);
}
