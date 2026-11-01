import { AxiosError } from 'axios';
import { toast } from 'sonner';

/** Status and string message of an API error, if it is one. */
export function readApiError(error: unknown): {
  status?: number;
  message?: string;
} {
  if (!(error instanceof AxiosError)) return {};
  const message: unknown = (error.response?.data as { message?: unknown })
    ?.message;
  return {
    status: error.response?.status,
    message: typeof message === 'string' ? message : undefined,
  };
}

/** Workspace quota (409) toast with a shortcut to the files settings. */
export function toastStorageFull(message: string | undefined, openFiles: () => void) {
  toast.error(message ?? 'Workspace storage is full', {
    action: { label: 'Manage files', onClick: openFiles },
  });
}
