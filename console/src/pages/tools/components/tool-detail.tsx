import Page from '@/components/common/page';
import { ToolConnectorConfigSheet } from '@/components/tools/tool-connector-config-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Image from '@/components/ui/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerGetToolById,
  useToolConfigProfilesControllerList,
  useToolConfigProfilesControllerRemove,
  useToolConfigProfilesControllerSetDefault,
  getToolConfigProfilesControllerListQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Group, Plus, Settings, Trash2, Verified } from 'lucide-react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import ToolInstallButton from './tool-install-button';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import { toast } from 'sonner';

/** Backend-augmented fields not yet in orval-generated Tool type. */
interface ToolWithConfig {
  hasConfigProfile?: boolean;
}

/** Extended profile shape returned by the API (orval type is incomplete). */
interface ProfileWithMeta {
  id: string;
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Masked config values for display (API masks sensitive fields). */
function maskConfig(config: Record<string, unknown>): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${val}`;
    })
    .join(', ');
}

export default function ToolDetail() {
  const { id } = useParams({ strict: false });
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();

  const {
    data: toolResponse,
    isLoading,
    error,
    refetch,
  } = useToolsControllerGetToolById(id || '', {
    query: {
      queryKey: ['tool-detail', selectedWorkspaceId, id],
    },
  });

  // Local state to track installation status
  const [isInstalled, setIsInstalled] = useState(false);

  // Update local state when tool data changes
  useEffect(() => {
    if (toolResponse) {
      setIsInstalled(toolResponse.isInstalled);
    }
  }, [toolResponse]);

  // Callback function to update installation status
  const handleInstallChange = () => {
    setIsInstalled((prev) => !prev);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">Loading tool details...</div>
      </div>
    );
  }

  if (error || !toolResponse) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-red-500">Error loading tool details</div>
      </div>
    );
  }

  const tool = toolResponse;
  const isConnector =
    tool.type === ToolsControllerGetManyToolsType.connector;
  const hasConfigProfile =
    isConnector && Boolean((tool as unknown as ToolWithConfig).hasConfigProfile);

  // Format category name for display
  const formatCategory = (category: string | undefined) => {
    if (!category) return 'N/A';
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format type for display
  const formatType = (type: string) => {
    switch (type) {
      case ToolsControllerGetManyToolsType.built_in:
        return 'Built-in';
      case ToolsControllerGetManyToolsType.connector:
        return 'Connector';
      default:
        return 'Provider';
    }
  };

  return (
    <Page>
      {/* Header Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Logo section */}

            <Image
              url={tool?.logoUrl}
              width={140}
              height={140}
              className="rounded-2xl"
            />
            {/* Content section */}
            <div className="flex-1">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-3xl">{tool.name}</CardTitle>
                    {tool.isOfficialSupport && (
                      <Badge variant="default" className="gap-1">
                        <Verified className="w-4 h-4" />
                        Official
                      </Badge>
                    )}
                    {isConnector && !hasConfigProfile && (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-yellow-700 bg-yellow-50 border-yellow-200"
                      >
                        Needs config
                      </Badge>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex-col md:flex-row flex md:items-center gap-2">
                    <div className="flex gap-2">
                      <ToolInstallButton
                        tool={tool}
                        workspaceId={selectedWorkspaceId || ''}
                        onInstallChange={handleInstallChange}
                      />
                    </div>
                    {(isInstalled || tool.isInstalled) &&
                      tool.type !==
                        ToolsControllerGetManyToolsType.built_in && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to="/assets"
                                search={{ filter: tool.id }}
                              >
                                <Button
                                  disabled={
                                    isConnector && !hasConfigProfile
                                  }
                                >
                                  <Group /> Add to group
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            {isConnector && !hasConfigProfile && (
                              <TooltipContent>
                                <p>
                                  Requires at least one configuration
                                  profile
                                </p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      )}
                  </div>
                </div>

                <p className="text-muted-foreground">
                  {tool.description || 'No description available.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="gap-1">
                    Category: {formatCategory(tool.category)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    Type: {formatType(tool.type)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Configuration Profiles section — visible only for connector tools */}
      {isConnector && isInstalled && (
        <ConfigProfilesSection toolId={tool.id} />
      )}
    </Page>
  );
}

/** Table of configuration profiles for a connector tool. */
function ConfigProfilesSection({ toolId }: { toolId: string }) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<{
    id: string;
    name: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
  } | null>(null);

  const { data: profilesRaw, isLoading } =
    useToolConfigProfilesControllerList(toolId);

  // Cast to extended shape (orval type is incomplete)
  const profiles = (profilesRaw ?? []) as unknown as ProfileWithMeta[];

  const { mutate: setDefault, isPending: isSettingDefault } =
    useToolConfigProfilesControllerSetDefault({
      mutation: {
        onSuccess: () => {
          toast.success('Default profile updated');
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to set default';
          toast.error(msg);
        },
      },
    });

  const { mutate: deleteProfile, isPending: isDeleting } =
    useToolConfigProfilesControllerRemove({
      mutation: {
        onSuccess: () => {
          toast.success('Profile deleted');
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to delete profile';
          toast.error(msg);
        },
      },
    });

  const handleEdit = (profile: ProfileWithMeta) => {
    setEditingProfile({
      id: profile.id,
      name: profile.name,
      config: profile.config,
      isDefault: profile.isDefault,
    });
    setSheetOpen(true);
  };

  const handleCreate = () => {
    setEditingProfile(null);
    setSheetOpen(true);
  };

  // The sheet needs a Tool object; construct minimal one from toolId
  const toolStub = { id: toolId } as import('@/services/apis/gen/queries').Tool;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Configuration Profiles</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Create Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading profiles...</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No profiles yet. Create one to make tool ready for groups.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {profile.name}
                      {profile.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-muted-foreground text-sm">
                    {maskConfig(profile.config)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dayjs(profile.createdAt).format('DD MMM YYYY')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!profile.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSettingDefault}
                          onClick={() =>
                            setDefault({ toolId, id: profile.id })
                          }
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(profile)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <ConfirmDialog
                        title="Delete Profile"
                        description={`Delete profile "${profile.name}"?`}
                        onConfirm={() =>
                          deleteProfile({ toolId, id: profile.id })
                        }
                        trigger={
                          <Button variant="ghost" size="sm" disabled={isDeleting}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ToolConnectorConfigSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setEditingProfile(null);
          }}
          tool={toolStub}
          initialData={editingProfile ?? undefined}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
