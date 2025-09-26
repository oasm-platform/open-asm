import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useStudioTemplate, defaultTemplate } from '@/hooks/useStudioTemplate';
import {
  getTemplatesControllerGetAllTemplatesQueryKey,
  useStorageControllerGetFile,
  useTemplatesControllerCreateTemplate,
  useTemplatesControllerGetTemplateById,
  useTemplatesControllerUploadFile,
} from '@/services/apis/gen/queries';
import { yaml } from '@codemirror/lang-yaml';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import type { AxiosError } from 'axios';
import * as prettierYaml from 'prettier/plugins/yaml';
import * as prettier from 'prettier/standalone';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import z from 'zod';
import { ScanComponent } from './scan-component';

const createFileNameSchema = z.object({
  fileName: z.string().min(1, 'Name is required'),
});

export default function Editor() {
  const queryClient = useQueryClient();

  const { activeTemplate, setActiveTemplate } = useStudioTemplate();
  // const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  // const setActiveTemplateId = useSetAtom(activeTemplateIdAtom);
  const { mutate: uploadTemplate } = useTemplatesControllerUploadFile();
  const { mutate: createTemplate } = useTemplatesControllerCreateTemplate();

  const [open, setOpen] = React.useState(false);

  const form = useForm({
    resolver: zodResolver(createFileNameSchema),
    defaultValues: {
      fileName: 'example-template.yaml',
    },
  });

  const { data } = useTemplatesControllerGetTemplateById(
    activeTemplate?.id || '',
    { query: { enabled: !activeTemplate?.isCreate } },
  );

  const [bucket, path] = useMemo(() => data?.path?.split('/') || [], [data]);

  const { data: fileData, refetch } = useStorageControllerGetFile(
    bucket,
    path,
    { query: { enabled: bucket !== undefined && path !== undefined } },
  );

  const contentSaved = useRef('');

  useEffect(() => {
    const readFile = async () => {
      if (fileData instanceof Blob) {
        const content = await fileData.text();
        contentSaved.current = content;
        setActiveTemplate({ content, isSaved: true });
        console.log('render');
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

  const handleUpload = useCallback(
    (content: string, id: string) => {
      uploadTemplate(
        {
          data: {
            fileContent: content,
            templateId: id,
          },
        },
        {
          onSuccess: () => {
            refetch();
            toast.success('Template is saved successfully');
          },
        },
      );
    },
    [refetch, uploadTemplate],
  );

  const handleCreate = (formData: z.infer<typeof createFileNameSchema>) => {
    if (!activeTemplate) return;
    if (formData.fileName.trim()) {
      createTemplate(
        {
          data: {
            fileName: formData.fileName,
          },
        },
        {
          onSuccess: (data) => {
            setActiveTemplate(
              {
                id: data.id,
                filename: data.fileName,
                isSaved: true,
                isCreate: false,
              },
              data.id,
            );
            handleUpload(activeTemplate.content, data.id);
            queryClient.invalidateQueries({
              queryKey: getTemplatesControllerGetAllTemplatesQueryKey(),
            });

            setOpen(false);
          },
          onError: (error) => {
            form.setError('fileName', {
              message: (error as AxiosError<{ message: string }>).response?.data
                .message,
            });
          },
        },
      );
    }
  };

  useHotkeys(
    'ctrl+s',
    async (e) => {
      e.preventDefault();
      if (!activeTemplate) return;

      if (
        activeTemplate.isSaved ||
        (activeTemplate.isCreate &&
          activeTemplate.content === defaultTemplate.content)
      ) {
        toast.warning('You have not made any changes', {
          closeButton: true,
        });
        return;
      }

      const isFormatted = await formatYAML();
      if (!isFormatted) return;

      if (activeTemplate.isCreate) {
        setOpen(true);
        return;
      }

      handleUpload(activeTemplate.content, activeTemplate.id);
    },

    { enableOnContentEditable: true },
  );

  const onChange = useCallback(
    (val: string) =>
      setActiveTemplate({
        content: val,
        isSaved: contentSaved.current === val,
      }),
    [setActiveTemplate],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {activeTemplate && (
        <>
          {activeTemplate && <ScanComponent template={activeTemplate} />}
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
          {activeTemplate.isCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Template</DialogTitle>
                  <DialogDescription>
                    Enter a filename for the template to continue
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleCreate)}
                    className="py-4"
                  >
                    <FormField
                      control={form.control}
                      name="fileName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>File name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter new file name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={form.handleSubmit(handleCreate)}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
