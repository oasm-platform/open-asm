import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Markdown } from '@/components/common/markdown';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type {
  SkillResponseDto,
} from '@/services/apis/gen/queries';
import {
  getAgentsControllerGetSkillsQueryKey,
  useAgentsControllerGetSkills,
  useAgentsControllerCreateSkill,
  useAgentsControllerUpdateSkill,
  useAgentsControllerDeleteSkill,
  useAgentsControllerToggleSkill,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BookOpen,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const skillSchema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  description: z.string().min(1, 'Description is required'),
  content: z.string().min(1, 'Content is required'),
});

type SkillFormData = z.input<typeof skillSchema>;

function SkillFormDialog({
  open,
  onOpenChange,
  editSkill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSkill?: SkillResponseDto | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!editSkill;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SkillFormData>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      name: editSkill?.name ?? '',
      description: editSkill?.description ?? '',
      content: editSkill?.content ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: editSkill?.name ?? '',
        description: editSkill?.description ?? '',
        content: editSkill?.content ?? '',
      });
    }
  }, [open, editSkill, reset]);

  const createSkill = useAgentsControllerCreateSkill({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAgentsControllerGetSkillsQueryKey() });
        toast.success('Skill created');
        onOpenChange(false);
        reset();
      },
      onError: () => toast.error('Failed to create skill'),
    },
  });

  const updateSkill = useAgentsControllerUpdateSkill({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAgentsControllerGetSkillsQueryKey() });
        toast.success('Skill updated');
        onOpenChange(false);
        reset();
      },
      onError: () => toast.error('Failed to update skill'),
    },
  });

  const onSubmit = (data: SkillFormData) => {
    if (isEditing && editSkill) {
      updateSkill.mutate({ id: editSkill.id, data });
    } else {
      createSkill.mutate({ data });
    }
  };

  const isPending = createSkill.isPending || updateSkill.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Skill' : 'Add Skill'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the skill instructions'
              : 'Create a new skill for the agent'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g. code-review"
              error={errors.name?.message}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              {...register('description')}
              placeholder="Brief description of when to use this skill"
              error={errors.description?.message}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              {...register('content')}
              placeholder="Write the skill instructions in markdown..."
              className={cn(
                'min-h-[200px] font-mono text-sm',
                errors.content && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50',
              )}
            />
            {errors.content && (
              <span className="text-xs text-destructive">{errors.content.message}</span>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-3 animate-spin mr-2" />
              ) : (
                <Plus className="size-3 mr-2" />
              )}
              {isEditing ? 'Save Changes' : 'Add Skill'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SkillRow({
  skill,
  onEdit,
}: {
  skill: SkillResponseDto;
  onEdit: (skill: SkillResponseDto) => void;
}) {
  const queryClient = useQueryClient();
  const isBuiltin = skill.isBuiltin;
  const [expanded, setExpanded] = useState(false);

  const toggle = useAgentsControllerToggleSkill({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAgentsControllerGetSkillsQueryKey() });
      },
      onError: () => toast.error('Failed to toggle skill'),
    },
  });

  const remove = useAgentsControllerDeleteSkill({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAgentsControllerGetSkillsQueryKey() });
        toast.success('Skill removed');
      },
      onError: () => toast.error('Failed to remove skill'),
    },
  });

  const handleToggle = (checked: boolean) => {
    toggle.mutate({ id: skill.id, data: { isEnabled: checked } });
  };

  const handleDelete = () => {
    remove.mutate({ id: skill.id });
  };

  return (
    <div className="group relative rounded-xl border bg-card transition-all duration-200 hover:shadow-md hover:border-border/80 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold tracking-tight truncate">{skill.name}</p>
              {isBuiltin && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                  System
                </span>
              )}
              {!isBuiltin && !skill.isEnabled && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 truncate selection:bg-primary/10">
              {skill.description}
            </p>
          </div>

          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform shrink-0',
              expanded && 'rotate-180',
            )}
          />
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <div className="px-2 h-8 flex items-center">
            <Switch
              checked={isBuiltin ? true : skill.isEnabled}
              onCheckedChange={handleToggle}
              disabled={isBuiltin || toggle.isPending}
              className="scale-90"
            />
          </div>

          {!isBuiltin && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(skill)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </Button>

              <ConfirmDialog
                title="Remove Skill"
                description={`Are you sure you want to remove the skill "${skill.name}"? This action cannot be undone.`}
                onConfirm={handleDelete}
                confirmText="Remove"
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={remove.isPending}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>

      {expanded && skill.content && (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          <Markdown content={skill.content} />
        </div>
      )}
    </div>
  );
}

export function SkillsManager() {
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const [showForm, setShowForm] = useState(false);
  const [editSkill, setEditSkill] = useState<SkillResponseDto | null>(null);

  const { data, isLoading } = useAgentsControllerGetSkills({
    query: {
      enabled: !!selectedWorkspaceId,
    },
  });

  const skills = data ?? [];

  const handleEdit = (skill: SkillResponseDto) => {
    setEditSkill(skill);
    setShowForm(true);
  };

  const handleFormClose = (open: boolean) => {
    setShowForm(open);
    if (!open) {
      setEditSkill(null);
    }
  };

  if (!selectedWorkspaceId) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {skills.length === 0
            ? 'No skills configured'
            : `${skills.length} skill${skills.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          Add Skill
        </Button>
      </div>

      <SkillFormDialog
        open={showForm}
        onOpenChange={handleFormClose}
        editSkill={editSkill}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-lg border animate-pulse bg-muted/30"
            />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <BookOpen className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Add skills to give the agent specialized instructions
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
