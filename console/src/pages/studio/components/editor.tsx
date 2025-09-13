import {
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
import { activeTemplateAtom, activeTemplateIdAtom } from '../atoms';
import { ScanComponent } from './scan-component';
import * as prettier from 'prettier/standalone';
import * as prettierYaml from 'prettier/plugins/yaml';

export default function Editor() {
  const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  const setActiveTemplateId = useSetAtom(activeTemplateIdAtom);
  const { mutate: uploadTemplate } = useTemplatesControllerUploadFile();
  const { mutateAsync: createTemplate } =
    useTemplatesControllerCreateTemplate();

  const { data } = useTemplatesControllerGetTemplateById(
    activeTemplate?.id || '',
  );

  const [bucket, path] = useMemo(() => data?.path?.split('/') || [], [data]);

  const { data: fileData, refetch } = useStorageControllerGetFile(bucket, path);
  const contentSaved = useRef(activeTemplate?.content);

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
    const toastId = toast.loading('Formating template...', {
      closeButton: true,
    });
    try {
      const formatted = await prettier.format(activeTemplate.content, {
        parser: 'yaml',
        plugins: [prettierYaml],
      });

      setActiveTemplate({ ...activeTemplate, content: formatted });
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
      const isFormatted = await formatYAML();
      if (!isFormatted) return;
      if (activeTemplate && contentSaved.current !== activeTemplate.content) {
        if (!data) {
          await createTemplate(
            {
              data: {
                fileName: activeTemplate.filename,
              },
            },
            {
              onSuccess: (data) => {
                setActiveTemplate({ id: data.id });
                setActiveTemplateId(data.id);
              },
            },
          );
        }
        uploadTemplate(
          {
            data: {
              fileContent: activeTemplate.content,
              templateId: activeTemplate.id,
            },
          },
          {
            onSuccess: () => {
              refetch();
            },
          },
        );
        toast.success('Template is saved successfully');
      } else {
        toast.warning('You have not made any changes', {
          closeButton: true,
        });
      }
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
