import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { toast } from 'sonner';

import { handleServerError } from '@/lib/handle-server-error';
import {
  getTemplatesControllerGetManyQueryKey,
  useTemplatesControllerCreate,
} from '@/services/apis/gen/queries';
import { readApiError, toastStorageFull } from '../template-errors';

const YAML_FILE = /\.ya?ml$/i;

/**
 * Creates one template per picked or dropped .yaml/.yml file. `input` is the
 * hidden file input behind `pick()`; render it next to the trigger.
 */
export function useTemplateUpload() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const create = useTemplatesControllerCreate({ mutation: { onError: () => {} } });

  const upload = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    let done = 0;
    // Sequential: concurrent creates would race for the workspace quota.
    for (const file of files) {
      if (!YAML_FILE.test(file.name)) {
        toast.error(`${file.name}: only .yaml or .yml files can be uploaded`);
        continue;
      }
      try {
        await create.mutateAsync({
          data: { name: file.name, content: await file.text() },
        });
        done++;
      } catch (error) {
        const { status, message } = readApiError(error);
        if (status === 409) {
          toastStorageFull(message, () =>
            void navigate({ to: '/settings/$tab', params: { tab: 'files' } }),
          );
          // Quota errors repeat for every remaining file; stop after the first.
          break;
        } else if ((status === 400 || status === 413) && message) {
          toast.error(`${file.name}: ${message}`);
        } else {
          handleServerError(error);
        }
      }
    }
    if (done) toast.success(`Uploaded ${done} template${done > 1 ? 's' : ''}`);
    await queryClient.invalidateQueries({
      queryKey: getTemplatesControllerGetManyQueryKey(),
    });
  };

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept=".yaml,.yml"
      multiple
      hidden
      aria-label="Upload templates"
      onChange={(e) => {
        void upload(e.target.files);
        e.target.value = '';
      }}
    />
  );

  return { upload, pick: () => fileInput.current?.click(), input };
}
