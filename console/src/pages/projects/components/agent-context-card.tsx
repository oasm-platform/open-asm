import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  getProjectsControllerGetFilesQueryKey,
  projectsControllerCompleteFile,
  projectsControllerPresignFile,
  useProjectsControllerGetFiles,
  useProjectsControllerRemoveFile,
  useProjectsControllerUpdate,
  type Project,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage, useInvalidateProjects } from '../project-utils';

export const INSTRUCTION_MAX = 2000;
export const PROJECT_FILE_LIMIT = 5;
const FILE_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.md,.markdown,.txt,.csv';

const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** POSTs the file to the presigned form: its fields first, the file last. */
async function postToForm(
  upload: { url: string; fields: Record<string, string> },
  file: File,
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append('file', file);
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
}

/**
 * What an AI Studio chat about the project reads: the members' instruction
 * and up to five text files, uploaded into the workspace Files.
 */
export function AgentContextCard({ project }: { project: Project }) {
  const archived = !!project.archivedAt;
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProjects();
  const update = useProjectsControllerUpdate();
  const remove = useProjectsControllerRemoveFile();
  const files = useProjectsControllerGetFiles(project.id);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const saved = project.instruction ?? '';
  const [instruction, setInstruction] = useState(saved);
  useEffect(() => setInstruction(saved), [project.id, saved]);

  const list = files.data ?? [];
  const full = list.length >= PROJECT_FILE_LIMIT;
  const refreshFiles = () =>
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerGetFilesQueryKey(project.id),
    });

  const saveInstruction = () =>
    update.mutate(
      { id: project.id, data: { instruction: instruction.trim() || null } },
      {
        onSuccess: () => {
          toast.success('Instruction saved');
          void invalidate();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to save the instruction')),
      },
    );

  const uploadFile = async (file: File) => {
    if (file.size > FILE_MAX_BYTES) {
      toast.error('A project file can be at most 10 MB');
      return;
    }
    setUploading(true);
    try {
      const { artifact, upload } = await projectsControllerPresignFile(project.id, {
        fileName: file.name,
        sizeBytes: file.size,
      });
      await postToForm(upload, file);
      await projectsControllerCompleteFile(project.id, artifact.id);
      toast.success(`${file.name} added`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to upload the file'));
    } finally {
      setUploading(false);
      void refreshFiles();
    }
  };

  const uploadButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={archived || full || uploading}
      onClick={() => inputRef.current?.click()}
    >
      {uploading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Upload className="size-4" />
      )}
      {uploading ? 'Uploading…' : 'Upload'}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI agent</CardTitle>
        <CardDescription>
          Every AI Studio chat started from this project follows these
          instructions and can read these files.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <section className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-instruction">Instructions</Label>
            <p className="text-sm text-muted-foreground">
              Tell the agent how to work on this project: what to focus on,
              what to stay away from and how to report back.
            </p>
          </div>
          <div className="relative">
            <Textarea
              id="project-instruction"
              value={instruction}
              disabled={archived}
              maxLength={INSTRUCTION_MAX}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Only test the staging hosts and rank findings by business impact"
              rows={6}
              className="min-h-36 resize-y pb-7"
            />
            <span className="pointer-events-none absolute right-3 bottom-2 text-xs tabular-nums text-muted-foreground">
              {instruction.length}/{INSTRUCTION_MAX}
            </span>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={archived || instruction.trim() === saved || update.isPending}
              onClick={saveInstruction}
            >
              Save
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label>
                Files
                <span className="font-normal text-muted-foreground">
                  {list.length}/{PROJECT_FILE_LIMIT}
                </span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Reference material the agent should know, such as scope notes,
                rules of engagement or asset lists.
              </p>
            </div>
            {list.length > 0 && uploadButton}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Upload a project file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadFile(file);
            }}
          />
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">No files yet</p>
                <p className="text-xs text-muted-foreground">
                  Markdown, text or CSV, up to 10 MB each
                </p>
              </div>
              {uploadButton}
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatSize(file.sizeBytes)}
                      {file.createdByName && ` · added by ${file.createdByName}`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`Detach ${file.name}`}
                    disabled={archived || remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: project.id, artifactId: file.id },
                        {
                          onSuccess: () => void refreshFiles(),
                          onError: (error) =>
                            toast.error(apiErrorMessage(error, 'Failed to detach the file')),
                        },
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Files are stored in the workspace Files and count toward its storage.
            Removing one here keeps it there.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
