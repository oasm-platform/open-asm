import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useProjectsControllerDelete,
  useProjectsControllerGetById,
  useProjectsControllerGetOverview,
} from '@/services/apis/gen/queries';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown, Play } from 'lucide-react';
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
  const remove = useProjectsControllerDelete();

  const [runOpen, setRunOpen] = useState(false);
  const [runBinding, setRunBinding] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) return <ProjectDetailSkeleton />;

  if (!project) {
    return (
      <Page isShowButtonGoBack permission="project.read">
        <div className="py-12 text-center">
          <h2 className="text-xl font-semibold">Project not found</h2>
          <p className="mt-2 text-muted-foreground">
            It may have been deleted, or you don't have access to it.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: '/projects' })}>
            Back to projects
          </Button>
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
    <Page
      isShowButtonGoBack
      permission="project.read"
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate">{project.name}</h1>
          {archived && <Badge variant="secondary">Archived</Badge>}
        </span>
      }
      header={
        <>
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
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Tabs value={tab} onValueChange={goTab}>
          <div className="w-full overflow-x-auto scrollbar-hide">
            <TabsList className="flex w-max flex-nowrap rounded-none bg-transparent p-0">
              {PROJECT_TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-9 flex-none hover:cursor-pointer"
                  badge={counts[t.value]}
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {archived && (
          <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            This project is archived: schedules and event triggers are off and
            it is read-only. Reopen it from the Settings tab to make changes.
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
