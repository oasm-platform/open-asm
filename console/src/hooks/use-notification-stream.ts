import { useQueryClient } from '@tanstack/react-query';
import { useSse } from './use-sse';

export function useNotificationStream() {
  const queryClient = useQueryClient();

  // Assuming the API URL is relative or configured in a constant
  // We need to match the API prefix used in axios-client or setup a proxy
  // axios-client has baseURL: '' which usually means same origin or proxy
  // Let's assume '/api/notifications/stream' or '/notifications/stream' depending on setup
  // Based on controller, it is 'notifications/stream'
  const streamUrl = '/api/notifications/stream'; 

  useSse(streamUrl, () => {
    // Invalidate queries to refetch data
    // Orval generates keys based on the URL. 
    // We should strictly use the generated/exported keys or match the pattern.
    // Based on orval config and grep, keys are path-based.
    // However, since we want to invalidate *all* notification lists (any params),
    // and unread count, we can use the base paths.
    
    // Invalidate all GetNotifications queries
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
  });
}
