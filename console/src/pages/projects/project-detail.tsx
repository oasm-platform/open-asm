import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useProjectsControllerArchive,
  useProjectsControllerDelete,
  useProjectsControllerGetById,
  useProjectsControllerGetOverview,
  useProjectsControllerUnarchive,
} from '@/services/apis/gen/queries';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Play,
  Trash,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { RunWorkflowDialog } from './components/run-workflow-dialog';
import { ProjectDetailSkeleton } from './project-detail-skeleton';
import {
  apiErrorMessage,
  isProjectTab,
  PROJECT_TABS,
  totalOf,
  useInvalidateProjects,
  workflowLabel,
  type ProjectTab,
} from './project-utils';
import { AssetsTab } from './tabs/assets-tab';
import { OverviewTab } from './tabs/overview-tab';
import { RunsTab } from './tabs/runs-tab';
import { ScheduleTab } from './tabs/schedule-tab';
import { SettingsTab } from './tabs/settings-tab';
import { VulnerabilitiesTab } from './tabs/vulnerabilities-tab';
import { WorkflowsTab } from './tabs/workflows-tab';

export default function ProjectDetail() {
  const { id = '', tab: rawTab } = useParams({ strict: false }) as {
    id?: string;
    tab?: string;
  };
  const tab: ProjectTab = isProjectTab(rawTab) ? rawTab : 'overview';
  const navigate = useNavigate();
  const invalidate = useInvalidateProjects();

  const { data: project, isLoading } = useProjectsControllerGetById(id);
  const { data: overview } = useProjectsControllerGetOverview(id);
  const archive = useProjectsControllerArchive();
  const unarchive = useProjectsControllerUnarchive();
  const remove = useProjectsControllerDelete();

  const [runOpen, setRunOpen] = useState(false);
  const [runBinding, setRunBinding] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <ProjectDetailSkeleton />;

  if (!project) {
    return (
      <Page isShowButtonGoBack permission="project.read">
        <div className="flex h-full items-center justify-center">
          <div className="text-lg text-red-500">Project not found</div>
        </div>
      </Page>
    );
  }

  const workflows = project.projectWorkflows ?? [];
  const archived = !!project.archivedAt;
  const goTab = (next: string) =>
    navigate({
      to: '/projects/$id/$tab',
      params: { id, tab: next },
      search: {},
    });

  const openRun = (bindingId?: string) => {
    setRunBinding(bindingId);
    setRunOpen(true);
  };

  const toggleArchive = () => {
    const mutation = archived ? unarchive : archive;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(archived ? 'Project reopened' : 'Project archived');
          void invalidate();
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to update the project')),
      },
    );
  };

  const handleDelete = () =>
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success('Project deleted');
          void navigate({ to: '/projects' });
          void invalidate(id);
        },
        onError: (error) =>
          toast.error(apiErrorMessage(error, 'Failed to delete the project')),
      },
    );

  const counts: Partial<Record<ProjectTab, number>> = {
    assets: overview?.totalAssets ?? project.totalAssets,
    vulnerabilities: totalOf(overview?.openVulnerabilities),
    workflows: workflows.length,
  };

  const tabs: Record<ProjectTab, ReactNode> = {
    overview: <OverviewTab projectId={id} project={project} />,
    assets: <AssetsTab projectId={id} archived={archived} />,
    vulnerabilities: <VulnerabilitiesTab projectId={id} workflows={workflows} />,
    workflows: (
      <WorkflowsTab
        projectId={id}
        workflows={workflows}
        archived={archived}
        onRun={openRun}
      />
    ),
    schedule: (
      <ScheduleTab projectId={id} workflows={workflows} archived={archived} />
    ),
    runs: <RunsTab projectId={id} workflows={workflows} />,
    settings: <SettingsTab project={project} onDelete={() => setDeleteOpen(true)} />,
  };

  return (
    <Page isShowButtonGoBack permission="project.read">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <span
            className="mt-2 size-3 shrink-0 rounded-full ring-1 ring-border/60"
            style={{ background: project.hexColor }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {project.name}
              </h1>
              {archived ? (
                <Badge variant="secondary">Archived</Badge>
              ) : (
                <Badge variant="soft">Active</Badge>
              )}
            </div>
            {project.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={archived || workflows.length === 0}>
                  <Play className="size-4" />
                  Run
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Run on the whole scope</DropdownMenuLabel>
                {workflows.map((binding) => (
                  <DropdownMenuItem key={binding.id} onSelect={() => openRun(binding.id)}>
                    {workflowLabel(binding.workflow)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              disabled={archived}
              onClick={() => goTab('settings')}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={toggleArchive}>
                  {archived ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  {archived ? 'Reopen project' : 'Archive project'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash className="size-4" />
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-x-auto border-b">
          <Tabs value={tab} onValueChange={goTab}>
            <TabsList>
              {PROJECT_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {counts[t.value] !== undefined && (
                    <span className="rounded-full border bg-muted px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">
                      {counts[t.value]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {archived && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            This project is archived: schedules and event triggers are off and
            it is read-only. Reopen it from the ⋯ menu to make changes.
          </p>
        )}

        {tabs[tab]}
      </div>

      <RunWorkflowDialog
        projectId={id}
        workflows={workflows}
        totalAssets={counts.assets ?? 0}
        open={runOpen}
        onOpenChange={setRunOpen}
        bindingId={runBinding}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete project"
        description={`Delete "${project.name}"? Its workflows and their run history go with it. Vulnerabilities stay in the workspace.`}
        onConfirm={handleDelete}
        typeToConfirm="delete"
        disabled={remove.isPending}
      />
    </Page>
  );
}
