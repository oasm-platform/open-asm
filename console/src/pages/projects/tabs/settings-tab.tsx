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
import {
  useProjectsControllerArchive,
  useProjectsControllerUnarchive,
  useProjectsControllerUpdate,
  type Project,
} from '@/services/apis/gen/queries';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
          toast.success('Project saved');
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save the project')),
      },
    );

  const toggleArchive = () =>
    (archived ? unarchive : archive).mutate(
      { id: project.id },
      {
        onSuccess: () => {
          toast.success(archived ? 'Project reopened' : 'Project archived');
          void invalidate();
        },
        onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update the project')),
      },
    );

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              disabled={archived}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              disabled={archived}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project covers"
              rows={3}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={archived || !dirty || !name.trim() || update.isPending}
              onClick={save}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Runs of this project notify like any scan: new vulnerabilities and
            scan results go to the workspace's notification and integration
            channels.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-[0.5px] border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Actions that stop or remove this project</CardDescription>
        </CardHeader>
        <CardContent>
          <Row
            title={archived ? 'Reopen project' : 'Archive project'}
            description={
              archived
                ? 'Registers the enabled schedules again and allows changes.'
                : 'Turns every schedule and trigger off and keeps the data read-only. Reopen any time.'
            }
          >
            <Button
              variant="outline"
              disabled={archive.isPending || unarchive.isPending}
              onClick={toggleArchive}
            >
              {archived ? 'Reopen' : 'Archive'}
            </Button>
          </Row>
          <Row
            title="Delete project"
            description="Deletes the project's workflows and their run history. Vulnerabilities stay in the workspace."
          >
            <Button variant="outline" onClick={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}
