import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n-dictionary';
import {
  useProjectsControllerArchive,
  useProjectsControllerUnarchive,
  useProjectsControllerUpdate,
  type Project,
} from '@/services/apis/gen/queries';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AgentContextCard } from '../components/agent-context-card';
import { apiErrorMessage, useInvalidateProjects } from '../project-utils';

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsTab({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: () => void;
}) {
  const t = useT();
  const invalidate = useInvalidateProjects();
  const update = useProjectsControllerUpdate();
  const archive = useProjectsControllerArchive();
  const unarchive = useProjectsControllerUnarchive();
  const archived = !!project.archivedAt;

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');

  // Follow the saved values, not every refetch of the same project.
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project.id, project.name, project.description]);

  const dirty =
    name.trim() !== project.name ||
    description.trim() !== (project.description ?? '');

  const save = () =>
    update.mutate(
      {
        id: project.id,
        data: {
          name: name.trim(),
          description: description.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('projects.settings.saved'));
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, t('projects.settings.saveFailed'))),
      },
    );

  const toggleArchive = () =>
    (archived ? unarchive : archive).mutate(
      { id: project.id },
      {
        onSuccess: () => {
          toast.success(
            archived
              ? t('projects.overview.audit.reopened')
              : t('projects.overview.audit.archived'),
          );
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, t('projects.settings.updateFailed'))),
      },
    );

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('projects.settings.information')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">{t('common.name')}</Label>
            <Input
              id="project-name"
              value={name}
              disabled={archived}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">{t('common.description')}</Label>
            <Textarea
              id="project-description"
              value={description}
              disabled={archived}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projects.create.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={archived || !dirty || !name.trim() || update.isPending}
              onClick={save}
            >
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AgentContextCard project={project} />

      <Card>
        <CardHeader>
          <CardTitle>{t('projects.settings.notifications')}</CardTitle>
          <CardDescription>
            {t('projects.settings.notificationsHint')}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-[0.5px] border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t('projects.settings.dangerZone')}</CardTitle>
          <CardDescription>{t('projects.settings.dangerZoneHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Row
            title={archived ? t('projects.settings.reopenTitle') : t('projects.settings.archiveTitle')}
            description={
              archived
                ? t('projects.settings.reopenHint')
                : t('projects.settings.archiveHint')
            }
          >
            <Button
              variant="outline"
              disabled={archive.isPending || unarchive.isPending}
              onClick={toggleArchive}
            >
              {archived ? t('projects.settings.reopen') : t('projects.settings.archive')}
            </Button>
          </Row>
          <Row
            title={t('projects.detail.deleteTitle')}
            description={t('projects.settings.deleteHint')}
          >
            <Button variant="outline" onClick={onDelete}>
              <Trash2 className="size-4" />
              {t('common.delete')}
            </Button>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}
