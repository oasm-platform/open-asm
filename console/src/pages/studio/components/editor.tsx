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
import { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { activeTemplateAtom, activeTemplateIdAtom } from '../atoms';
import { ScanComponent } from './scan-component';

export default function Editor() {
  const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  const setActiveTemplateId = useSetAtom(activeTemplateIdAtom);
  const { mutate: uploadTemplate } = useTemplatesControllerUploadFile();
  const { mutateAsync: createTemplate } =
    useTemplatesControllerCreateTemplate();

  const { data } = useTemplatesControllerGetTemplateById(
    activeTemplate?.id || '',
  );

  let bucket = '';
  let path = '';
  if (data && data.path) {
    bucket = data.path.split('/')[0];
    path = data.path.split('/')[1];
  }

  const { data: fileData } = useStorageControllerGetFile(bucket, path);
  const contentSaved = useRef(activeTemplate?.content);

  useEffect(() => {
    const readFile = async () => {
      if (fileData instanceof Blob) {
        contentSaved.current = await fileData.text();
      }
    };
    readFile();
  }, [fileData]);

  useHotkeys(
    'ctrl+s',
    async (e) => {
      e.preventDefault();
      if (activeTemplate && contentSaved.current !== activeTemplate.content) {
        if (!data) {
          const template = await createTemplate({
            data: {
              fileName: activeTemplate.filename,
            },
          });
          uploadTemplate({
            data: {
              fileContent: activeTemplate.content,
              templateId: template.id,
            },
          });
          setActiveTemplate({ id: template.id });
          setActiveTemplateId(template.id);
        } else {
          uploadTemplate({
            data: {
              fileContent: activeTemplate.content,
              templateId: data.id,
            },
          });
        }
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
