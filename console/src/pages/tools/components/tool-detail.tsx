import Page from '@/components/common/page';
import { ToolConnectorConfigSheet } from '@/components/tools/tool-connector-config-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Image from '@/components/ui/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  getToolConfigProfilesControllerListQueryKey,
  ToolsControllerGetManyToolsType,
  useToolConfigProfilesControllerList,
  useToolConfigProfilesControllerRemove,
  useToolConfigProfilesControllerSetDefault,
  useToolsControllerGetConnectorBySlug,
  useToolsControllerGetToolById,
  type ConnectorDto,
  type Tool,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import dayjs from 'dayjs';
import {
  BadgeCheck,
  Box,
  Plus,
  Settings,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import ToolInstallButton from './tool-install-button';

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

interface ToolTab {
  id: string;
  label: string;
  /** Only render a tab when the data backing it exists (mirrors the reference page). */
  visible: boolean;
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

  // Connector manifest metadata (Overview tab). Backend stores connector
  // tools with name = slug (syncConnectorsFromManifest sets name = slug;
  // tool-config-profiles.service: "Tool.name IS the connector slug").
  const toolSlug =
    toolResponse?.type === ToolsControllerGetManyToolsType.connector
      ? toolResponse.name
      : undefined;
  const { data: connectorMeta, isLoading: connectorMetaLoading } =
    useToolsControllerGetConnectorBySlug(toolSlug ?? '', {
      query: { enabled: Boolean(toolSlug), retry: false },
    });

  // Active tab for the default Tabs control (Overview, Configuration)
  const [activeTab, setActiveTab] = useState('configuration');

  // Default to Overview once its metadata resolves — first flip only, so a
  // tab the user already picked is never overridden.
  const overviewDefaultApplied = useRef(false);
  useEffect(() => {
    if (
      toolSlug &&
      connectorMeta &&
      !connectorMetaLoading &&
      !overviewDefaultApplied.current
    ) {
      overviewDefaultApplied.current = true;
      setActiveTab('overview');
    }
  }, [toolSlug, connectorMeta, connectorMetaLoading]);

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
  const isConnector = tool.type === ToolsControllerGetManyToolsType.connector;
  const hasConfigProfile =
    isConnector &&
    Boolean((tool as unknown as ToolWithConfig).hasConfigProfile);

  // Data-driven tab list: a tab appears only when its content can be shown.
  const overviewVisible =
    Boolean(toolSlug) && Boolean(connectorMeta) && !connectorMetaLoading;

  const tabs: ToolTab[] = [
    {
      id: 'overview',
      label: 'Overview',
      visible: overviewVisible,
    },
    {
      id: 'configuration',
      label: 'Configuration',
      visible: isConnector && isInstalled,
    },
    // Future tabs (Reviews, Pricing, Support, ...) get appended here with
    // their own visibility condition — they render nothing until data exists.
  ].filter((tab) => tab.visible);

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
      <div className="mb-4 space-y-4">
        {/* Hero: logo, name, badges, meta + install CTA */}
        <Card className="py-2 gap-2">
          <CardContent className="px-2 md:px-4 py-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Image
                url={tool?.logoUrl}
                width={80}
                height={80}
                className="rounded-2xl shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      {tool.name}
                    </h1>
                    {tool.isOfficialSupport && (
                      <BadgeCheck
                        title="Official"
                        className="size-4 shrink-0 text-blue-500"
                      />
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
                  <div className="shrink-0">
                    <ToolInstallButton
                      tool={tool}
                      workspaceId={selectedWorkspaceId || ''}
                      onInstallChange={handleInstallChange}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {tool.category && (
                    <Badge variant="secondary" className="gap-1">
                      <Tag />
                      {formatCategory(tool.category)}
                    </Badge>
                  )}
                  {tool.type && (
                    <Badge variant="secondary" className="gap-1">
                      <Box />
                      {formatType(tool.type)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Default Tabs control — same pattern as the other detail pages */}
        {tabs.length > 0 && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="hover:cursor-pointer"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              {connectorMeta && <OverviewSection meta={connectorMeta} />}
            </TabsContent>
            <TabsContent value="configuration">
              {isConnector && isInstalled && (
                <ConfigProfilesSection tool={tool} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Page>
  );
}

/** Connector metadata incl. backend-augmented fields not yet in orval-generated ConnectorDto.
 * TODO: remove augmentation + run `task gen-api` after core-api ships
 * { pricingTier, homepage, repositoryUrl, supportUrl } in GET /tools/connectors/:slug. */
type ConnectorMeta = ConnectorDto & {
  pricingTier?: string[] | string;
  homepage?: string;
  repositoryUrl?: string;
  supportUrl?: string;
};

/** Force https when no scheme so the link is openable and no other scheme
 * (e.g. javascript:, data:) can slip through. */
function toSafeHttpUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Overview tab content: connector manifest metadata (Version, Author, ...). */
function OverviewSection({ meta }: { meta: ConnectorMeta }) {
  // New API returns string[]; accept legacy string until `task gen-api` regens types.
  const pricingTiers: string[] = (
    Array.isArray(meta.pricingTier)
      ? meta.pricingTier
      : meta.pricingTier
        ? [meta.pricingTier]
        : []
  )
    .filter(Boolean)
    .map(
      (tier) => tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase(),
    );
  const metaRows: { label: string; value: string; href?: string }[] = [
    { label: 'Version', value: meta.version },
    { label: 'Author', value: meta.author ?? '' },
    {
      label: 'Image',
      value: meta.image,
      // Manifest stores registry paths without scheme (ghcr.io/...) —
      // force https so the link is always openable and no other scheme
      // (e.g. javascript:) can slip through.
      href: toSafeHttpUrl(meta.image),
    },
    ...(meta.homepage
      ? [
          {
            label: 'Homepage',
            value: meta.homepage,
            href: toSafeHttpUrl(meta.homepage),
          },
        ]
      : []),
    ...(meta.repositoryUrl
      ? [
          {
            label: 'Repository',
            value: meta.repositoryUrl,
            href: toSafeHttpUrl(meta.repositoryUrl),
          },
        ]
      : []),
    ...(meta.supportUrl
      ? [
          {
            label: 'Support',
            value: meta.supportUrl,
            href: toSafeHttpUrl(meta.supportUrl),
          },
        ]
      : []),
  ].filter((row) => row.value !== '');

  return (
    <Card className="py-2 gap-2">
      <CardContent className="px-2 md:px-4 py-2">
        {meta.shortDescription && (
          <p className="text-sm font-medium">{meta.shortDescription}</p>
        )}
        {meta.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            {meta.description}
          </p>
        )}

        {metaRows.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {metaRows.map((row) => (
              <div key={row.label}>
                <p className="text-xs text-muted-foreground">{row.label}</p>
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium break-all text-primary underline-offset-4 hover:underline"
                  >
                    {row.value}
                  </a>
                ) : (
                  <p className="text-sm font-medium break-all">{row.value}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {pricingTiers.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Pricing</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {pricingTiers.map((tier) => (
                <Badge key={tier} variant="secondary">
                  {tier}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {meta.capabilities.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {meta.capabilities.map((capability) => (
              <Badge key={capability} variant="secondary">
                {capability}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Table of configuration profiles for a connector tool. */
function ConfigProfilesSection({ tool }: { tool: Tool }) {
  const queryClient = useQueryClient();
  const toolId = tool.id;
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

  // The sheet needs the real Tool object for its header (name, logoUrl)

  return (
    <Card className="">
      <CardHeader className="flex flex-row items-center justify-between gap-4 px-2 md:px-4 py-2">
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Create Profile
        </Button>
      </CardHeader>
      <CardContent className="px-2 md:px-4 py-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading profiles...</p>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">No configuration profiles yet</p>
            <p className="text-sm text-muted-foreground">
              Create a profile to make this tool ready for asset groups.
            </p>
            <Button size="sm" onClick={handleCreate} className="mt-2">
              <Plus className="mr-1 h-4 w-4" />
              Create Profile
            </Button>
          </div>
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
                          onClick={() => setDefault({ toolId, id: profile.id })}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isDeleting}
                          >
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
          tool={tool}
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
