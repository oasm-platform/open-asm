import Page from '@/components/common/page';
import { ToolConnectorConfigSheet } from '@/components/tools/tool-connector-config-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
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
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { BadgeCheck, Box, Plus, Settings, Tag, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfigProfilesSkeleton,
  ToolDetailSkeleton,
} from './tool-detail-skeleton';
import ToolInstallButton from './tool-install-button';

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

  // Tabs are URL-driven (?tab=overview|configuration) via Tabs tabParam.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };

  // Default to Overview once its metadata resolves — first flip only, so a
  // tab the user already picked (or linked) is never overridden.
  const overviewDefaultApplied = useRef(false);
  useEffect(() => {
    if (
      toolSlug &&
      connectorMeta &&
      !connectorMetaLoading &&
      !overviewDefaultApplied.current &&
      !search.tab
    ) {
      overviewDefaultApplied.current = true;
      navigate({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        search: { ...search, tab: 'overview' } as any,
        replace: true,
      });
    }
    // `search` intentionally omitted — avoids a navigate loop on back/forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolSlug, connectorMeta, connectorMetaLoading, navigate]);

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
    return <ToolDetailSkeleton />;
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
    <Page isShowButtonGoBack>
      <div className="mb-4 space-y-4">
        {/* Hero: logo, name, badges, meta + install CTA */}
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Image
                  url={tool?.logoUrl}
                  width={80}
                  height={80}
                  className="size-20 shrink-0 rounded-2xl"
                />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      {tool.name}
                    </h1>
                    {tool.isOfficialSupport && (
                      <span title="Official" className="inline-flex shrink-0">
                        <BadgeCheck className="size-4 text-blue-500" />
                      </span>
                    )}
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
              <ToolInstallButton
                tool={tool}
                workspaceId={selectedWorkspaceId || ''}
                onInstallChange={handleInstallChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* Default Tabs control — same pattern as the other detail pages */}
        {tabs.length > 0 && (
          <Tabs
            tabParam="tab"
            defaultValue="configuration"
            validValues={['overview', 'configuration']}
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
    .map((tier) => tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase());
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
    <Card>
      <CardContent>
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

  const handleCreate = () => {
    setEditingProfile(null);
    setSheetOpen(true);
  };

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

  // The sheet needs the real Tool object for its header (name, logoUrl)

  return (
    <Card>
      <CardContent>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <CardTitle>Configuration Profiles</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Manage configuration profiles for this tool. Each profile defines
              a set of parameters that can be applied when running scans.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Config
          </Button>
        </div>

        {isLoading ? (
          <ConfigProfilesSkeleton />
        ) : profiles.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-4">
            No configuration profiles yet.
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
