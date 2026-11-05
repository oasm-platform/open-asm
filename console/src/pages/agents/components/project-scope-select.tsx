import { FolderKanban } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useProjectsControllerGetMany,
  type ConversationProjectDto,
} from '@/services/apis/gen/queries';

const NO_PROJECT = 'none';

interface ProjectScopeSelectProps {
  value: ConversationProjectDto | null;
  /** Left out once the chat exists: its project can no longer change. */
  onChange?: (project: ConversationProjectDto | null) => void;
  className?: string;
}

export function ProjectDot({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? undefined }}
    />
  );
}

/**
 * The project a chat is about, shown above the prompt input. A new chat picks
 * it here; the agent's data tools then stay inside that project.
 */
export function ProjectScopeSelect({
  value,
  onChange,
  className,
}: ProjectScopeSelectProps) {
  const { data } = useProjectsControllerGetMany(
    { page: 1, limit: 100, sortBy: 'name', sortOrder: 'ASC', status: 'active' },
    { query: { enabled: !!onChange } },
  );

  if (!onChange) {
    if (!value) return null;
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground',
          className,
        )}
        title="The agent only reads and acts inside this project"
      >
        <FolderKanban className="size-3.5" />
        <ProjectDot color={value.hexColor} />
        <span className="truncate">{value.name}</span>
      </div>
    );
  }

  const listed = data?.data ?? [];
  // A project opened by link may be archived, so not listed: keep it pickable
  const projects =
    value && !listed.some((p) => p.id === value.id)
      ? [{ ...value, hexColor: value.hexColor ?? '' }, ...listed]
      : listed;
  return (
    <Select
      value={value?.id ?? NO_PROJECT}
      onValueChange={(id) => {
        const picked = projects.find((p) => p.id === id);
        onChange(
          picked
            ? { id: picked.id, name: picked.name, hexColor: picked.hexColor }
            : null,
        );
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Project"
        className={cn(
          'w-auto max-w-64 data-[size=sm]:h-7 gap-1.5 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent dark:bg-transparent',
          className,
        )}
      >
        <FolderKanban className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={NO_PROJECT}>Whole workspace</SelectItem>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <ProjectDot color={p.hexColor} />
            <span className="truncate">{p.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
