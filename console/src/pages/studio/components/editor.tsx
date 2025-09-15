import {
  getTemplatesControllerGetAllTemplatesQueryKey,
  useStorageControllerGetFile,
  useTemplatesControllerCreateTemplate,
  useTemplatesControllerGetTemplateById,
  useTemplatesControllerUploadFile,
} from '@/services/apis/gen/queries';
import { yaml } from '@codemirror/lang-yaml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import {
  activeTemplateAtom,
  activeTemplateIdAtom,
  defaultTemplates,
} from '../atoms';
import { ScanComponent } from './scan-component';
import * as prettier from 'prettier/standalone';
import * as prettierYaml from 'prettier/plugins/yaml';
import { useQueryClient } from '@tanstack/react-query';

//TODO: add url params for better ux
export default function Editor() {
  const queryClient = useQueryClient();

  const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  const setActiveTemplateId = useSetAtom(activeTemplateIdAtom);
  const { mutate: uploadTemplate } = useTemplatesControllerUploadFile();
  const { mutateAsync: createTemplate } =
    useTemplatesControllerCreateTemplate();

  const { data } = useTemplatesControllerGetTemplateById(
    activeTemplate?.id || '',
  );

  const [bucket, path] = useMemo(() => data?.path?.split('/') || [], [data]);

  const { data: fileData, refetch } = useStorageControllerGetFile(
    bucket,
    path,
    { query: { enabled: bucket !== undefined && path !== undefined } },
  );
  const contentSaved = useRef(
    activeTemplate?.content || defaultTemplates.content,
  );

  useEffect(() => {
    const readFile = async () => {
      if (fileData instanceof Blob) {
        const content = await fileData.text();
        contentSaved.current = content;
        setActiveTemplate({ content });
      }
    };
    readFile();
  }, [fileData, setActiveTemplate]);

  const formatYAML = useCallback(async () => {
    if (!activeTemplate?.content) {
      toast.error('No content to format', { closeButton: true });
      return false;
    }
    const toastId = toast.loading('Formatting template...', {
      closeButton: true,
    });
    try {
      const formatted = await prettier.format(activeTemplate.content, {
        parser: 'yaml',
        plugins: [prettierYaml],
      });

      setActiveTemplate({ ...activeTemplate, content: formatted });
      contentSaved.current = formatted;
      toast.success('Template formatted successfully', {
        closeButton: true,
        id: toastId,
      });
    } catch {
      toast.error(
        'Error happened, please check the template before formatting',
        {
          closeButton: true,
          id: toastId,
        },
      );
      return false;
    }
    return true;
  }, [activeTemplate, setActiveTemplate]);

  useHotkeys(
    'ctrl+shift+f',
    (e) => {
      e.preventDefault();
      formatYAML();
    },
    { enableOnContentEditable: true },
  );

  useHotkeys(
    'ctrl+s',
    async (e) => {
      e.preventDefault();
      if (!activeTemplate) return;
      let uploadId = activeTemplate.id;

      if (
        contentSaved.current === activeTemplate.content ||
        activeTemplate.content === defaultTemplates.content
      ) {
        toast.warning('You have not made any changes', {
          closeButton: true,
        });
        return;
      }

      const isFormatted = await formatYAML();
      if (!isFormatted) return;

      if (!data) {
        const data = await createTemplate({
          data: {
            fileName: activeTemplate.filename,
          },
        });
        setActiveTemplate({ id: data.id });
        setActiveTemplateId(data.id);
        uploadId = data.id;
        queryClient.invalidateQueries({
          queryKey: getTemplatesControllerGetAllTemplatesQueryKey(),
        });
      }

      uploadTemplate(
        {
          data: {
            fileContent: activeTemplate.content,
            templateId: uploadId,
          },
        },
        {
          onSuccess: () => {
            refetch();
          },
        },
      );
      toast.success('Template is saved successfully');
    },
    { enableOnContentEditable: true },
  );

  const onChange = useCallback(
    (val: string) => setActiveTemplate({ ...activeTemplate, content: val }),
    [activeTemplate, setActiveTemplate],
  );
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScanComponent />
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={activeTemplate?.content}
          onChange={onChange}
          theme={tokyoNight}
          extensions={[yaml()]}
          className="text-sm h-full"
          height="100%"
        />
      </div>
    </div>
  );
}
