import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useAgentsControllerGetSkills,
  useAgentsControllerDeleteSkill,
  useAgentsControllerUpsertSkill,
  useAgentsControllerGetSkill,
  useAgentsControllerToggleSkillStatus,
  type SkillResponseDto,
  getAgentsControllerGetSkillsQueryKey,
} from '@/services/apis/gen/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Search, Plus, Pencil, Trash2, Workflow, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import CodeMirror from '@uiw/react-codemirror';
import { markdown as mdLang } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import type { AxiosError } from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const blackTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#000', color: '#e5e5e5' },
    '.cm-content': { caretColor: '#fff' },
    '.cm-cursor': { borderLeftColor: '#fff' },
    '.cm-gutters': {
      backgroundColor: '#000',
      color: '#555',
      borderRight: '1px solid #1f1f1f',
    },
    '.cm-activeLineGutter': { backgroundColor: '#000' },
    '.cm-activeLine': { backgroundColor: '#0a0a0a' },
    '.cm-selectionBackground, .cm-focused .cm-selectionBackground': {
      backgroundColor: '#2a2a2a',
    },
    '.cm-line': { padding: '0 4px' },
  },
  { dark: true },
);

const DEFAULT_TEMPLATE = `## When to use this skill
Describe when the agent should activate this skill.

## How to execute
Step-by-step instructions for the agent.

## Tools to use
- List the relevant tools (e.g. \`get_assets\`, \`web_fetch\`)
`;

// --- SkillRow ---

function SkillRow({
  skill,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  skill: SkillResponseDto;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}) {
  const isActive = skill.status === 'active';
  const summary = skill.description
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#'))
    ?.trim()
    .slice(0, 120);

  return (
    <div
      className={`flex items-center gap-4 py-3 px-4 border-b last:border-b-0 text-sm ${!isActive ? 'opacity-50' : ''}`}
    >
      <Workflow className="size-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{skill.title}</p>
        {summary && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {summary}
          </p>
        )}
      </div>

      <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
        {dayjs(skill.updatedAt).fromNow()}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={isActive}
          onCheckedChange={() => onToggleStatus(skill.id)}
          className="scale-75"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(skill.id)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <ConfirmDialog
          title="Remove Skill"
          description={`Are you sure you want to remove "${skill.title}"? This action cannot be undone.`}
          onConfirm={() => onDelete(skill.id)}
          confirmText="Remove"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

// --- SkillEditor ---

function SkillEditor({
  id,
  onSuccess,
  onCancel,
}: {
  id?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(DEFAULT_TEMPLATE);

  const { data: skill, isLoading: isLoadingSkill } =
    useAgentsControllerGetSkill(id!, { query: { enabled: !!id } });
  const { mutate: upsertSkill, isPending } = useAgentsControllerUpsertSkill();

  useEffect(() => {
    if (skill) {
      setTitle(skill.title);
      setBody(skill.description);
    }
  }, [skill]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Skill title is required');
      return;
    }

    const markdown = `---\ntitle: "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"\n---\n\n${body}`;

    upsertSkill(
      { data: { markdown } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAgentsControllerGetSkillsQueryKey(),
          });
          toast.success('Skill saved successfully');
          onSuccess();
        },
        onError: (error: unknown) => {
          const axiosError = error as AxiosError<{ message: string }>;
          toast.error(
            axiosError.response?.data?.message || 'Failed to save skill',
          );
        },
      },
    );
  };

  if (id && isLoadingSkill) {
    return (
      <div className="rounded-lg p-12 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Subdomain Discovery"
            className="max-w-sm h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Instructions (Markdown)
          </label>
          <div className="rounded-md border overflow-hidden">
            <CodeMirror
              value={body}
              height="320px"
              theme={blackTheme}
              extensions={[mdLang()]}
              onChange={setBody}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-8"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending}
          size="sm"
          className="h-8 gap-1.5"
        >
          {isPending && <Loader2 className="size-3 animate-spin" />}
          {id ? 'Update Skill' : 'Create Skill'}
        </Button>
      </div>
    </div>
  );
}

// --- Main ---

export default function AgentSettingsSkill() {
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  const {
    data: skills,
    isLoading,
    refetch,
  } = useAgentsControllerGetSkills({
    query: { enabled: !!selectedWorkspaceId },
  });
  const { mutate: deleteSkill } = useAgentsControllerDeleteSkill();
  const { mutate: toggleStatus } = useAgentsControllerToggleSkillStatus();

  const filteredSkills = useMemo(() => {
    const rawData =
      (skills as unknown as { data?: SkillResponseDto[] })?.data ?? skills;
    const list = Array.isArray(rawData) ? (rawData as SkillResponseDto[]) : [];
    const q = search.toLowerCase();
    return list.filter(
      (s) =>
        s?.title?.toLowerCase().includes(q) ||
        s?.description?.toLowerCase().includes(q),
    );
  }, [skills, search]);

  const handleDelete = (id: string) => {
    deleteSkill(
      { id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAgentsControllerGetSkillsQueryKey(),
          });
          toast.success('Skill removed');
        },
      },
    );
  };

  const handleToggleStatus = (id: string) => {
    const queryKey = getAgentsControllerGetSkillsQueryKey();
    type CacheData =
      | { data?: SkillResponseDto[] }
      | SkillResponseDto[]
      | undefined;

    const previous = queryClient.getQueryData<CacheData>(queryKey);

    const updateList = (list: SkillResponseDto[]) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s,
              status: (s.status === 'active'
                ? 'inactive'
                : 'active') as SkillResponseDto['status'],
            }
          : s,
      );

    queryClient.setQueryData<CacheData>(queryKey, (old) => {
      if (!old) return old;
      if (Array.isArray(old)) return updateList(old);
      const list = (old as { data?: SkillResponseDto[] }).data;
      return { ...(old as object), data: list ? updateList(list) : list };
    });

    toggleStatus(
      { id },
      {
        onSuccess: (updated) => {
          toast.success(
            updated.status === 'active'
              ? 'Skill activated'
              : 'Skill deactivated',
          );
        },
        onError: () => {
          queryClient.setQueryData(queryKey, previous);
          toast.error('Failed to update skill status');
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Agent Skills</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage specialized workflows loaded on demand by the agent.
          </p>
        </div>
        {!isEditing && (
          <Button
            onClick={() => {
              setEditingId(undefined);
              setIsEditing(true);
            }}
            size="sm"
            variant="outline"
            className="border-dashed"
          >
            <Plus className="mr-2 h-4 w-4" /> Add Skill
          </Button>
        )}
      </div>

      {isEditing && (
        <SkillEditor
          id={editingId}
          onSuccess={() => {
            setIsEditing(false);
            refetch();
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}

      {!isEditing && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="border rounded-lg divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse bg-muted/20" />
              ))}
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="rounded-lg border-dashed p-10 text-center">
              <Workflow className="size-7 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No skills found</p>
              <p className="text-xs text-muted-foreground mb-4">
                {search
                  ? 'Try a different search term.'
                  : 'Add your first skill to extend agent capabilities.'}
              </p>
              {search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={() => setSearch('')}
                >
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {filteredSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onEdit={(id) => {
                    setEditingId(id);
                    setIsEditing(true);
                  }}
                  onDelete={handleDelete}
                  onToggleStatus={handleToggleStatus}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
