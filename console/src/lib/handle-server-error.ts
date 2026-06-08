import { AxiosError } from 'axios';
import { toast } from 'sonner';

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    console.log('Server Error:', error);
  }

  let errMsg = 'Something went wrong!';

  if (error instanceof AxiosError) {
    const data = error.response?.data;

    if (data && typeof data === 'object') {
      const rawMessage = data.message || data.title;

      if (Array.isArray(rawMessage) && rawMessage.length > 0) {
        errMsg = rawMessage.join(', ');
      } else if (
        typeof rawMessage === 'string' &&
        rawMessage.trim().length > 0
      ) {
        errMsg = rawMessage.trim();
      }
    } else if (typeof data === 'string' && data.trim().length > 0) {
      errMsg = data.trim().slice(0, 100);
    }
  } else if (error instanceof Error && error.message.trim().length > 0) {
    errMsg = error.message;
  }

  toast.error(errMsg);
}
