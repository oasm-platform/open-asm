import { formatDate } from '@/lib/date-locale';
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
import LogoFrame from '@/components/ui/logo-frame';
import { OpenLink } from '@/components/ui/open-link';
import ToolLogo from '@/components/ui/tool-logo';
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
import { getRouteApi, useParams } from '@tanstack/react-router';
import {
  BadgeCheck,
  Box,
  Plus,
  Settings,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfigProfilesSkeleton,
  ToolDetailSkeleton,
} from './tool-detail-skeleton';
import { formatCategory } from './format-category';
import ToolInstallButton from './tool-install-button';
import { t, useT } from '@/lib/i18n-dictionary';

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
const TARGET_TYPE_LABEL_KEYS: Record<string, string> = {
  DOMAIN: 'tools.detail.targetType.domain',
  GIT_ORG: 'tools.detail.targetType.gitOrg',
};

function formatTargetType(targetType: string): string {
  const key = TARGET_TYPE_LABEL_KEYS[targetType];
  return key ? t(key) : targetType;
}

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
  labelKey: string;
  /** Only render a tab when the data backing it exists (mirrors the reference page). */
  visible: boolean;
}

const routeApi = getRouteApi('/_authed/tools/$id');

export default function ToolDetail() {
  const tr = useT();
  const { id } = useParams({ strict: false });
  const navigate = routeApi.useNavigate();
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

  // Update local state when tool data changes
  useEffect(() => {
    if (toolResponse) {
      setIsInstalled(toolResponse.isInstalled);
    }
  }, [toolResponse]);

  // Callback function to update installation status
  const handleInstallChange = () => {
    const nowInstalled = !isInstalled;
    setIsInstalled(nowInstalled);
    refetch();
    // A freshly installed connector needs a configuration profile: land on the
    // Configuration tab with the create sheet already open.
    if (nowInstalled && toolSlug) {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: 'configuration',
          openCreateToolConfiguration: true,
        }),
        replace: true,
      });
    }
  };

  if (isLoading) {
    return <ToolDetailSkeleton />;
  }

  if (error || !toolResponse) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-red-500">
          {tr('tools.detail.loadError')}
        </div>
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
      labelKey: 'tools.detail.tabs.overview',
      visible: overviewVisible,
    },
    {
      id: 'configuration',
      labelKey: 'tools.detail.tabs.configuration',
      visible: isConnector && isInstalled,
    },
    // Future tabs (Reviews, Pricing, Support, ...) get appended here with
    // their own visibility condition — they render nothing until data exists.
  ].filter((tab) => tab.visible);

  // Format type for display
  const formatType = (type: string) => {
    switch (type) {
      case ToolsControllerGetManyToolsType.built_in:
        return tr('tools.detail.type.builtIn');
      case ToolsControllerGetManyToolsType.connector:
        return tr('tools.detail.type.connector');
      default:
        return tr('tools.detail.type.provider');
    }
  };

  return (
    <Page documentTitle={tool.name}>
      <div className="mb-4 space-y-4">
        {/* Hero: logo, name, badges, meta + install CTA */}
        <Card>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                {/* Same tile as the tools list: logos are drawn for light
                    backgrounds, so a bare img disappears in dark mode. */}
                <LogoFrame className="shrink-0 overflow-hidden">
                  <ToolLogo
                    name={tool.name}
                    logoUrl={tool?.logoUrl}
                    size={80}
                  />
                </LogoFrame>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      {tool.name}
                    </h1>
                    {tool.isOfficialSupport && (
                      <span
                        title={tr('tools.card.official')}
                        className="inline-flex shrink-0"
                      >
                        <BadgeCheck className="size-4 text-blue-500" />
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tool.categories?.map((c) => (
                      <Badge
                        key={c.name}
                        variant="secondary"
                        className="gap-1"
                        title={tr('tools.detail.categoryTargetTypes')}
                      >
                        <Tag />
                        {formatCategory(c.name)}
                        {c.targetTypes.length > 0 && (
                          <span className="text-muted-foreground">
                            · {c.targetTypes.map(formatTargetType).join(', ')}
                          </span>
                        )}
                      </Badge>
                    ))}
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
            // Valid values mirror the tabs that actually render, so a stale
            // ?tab= (e.g. configuration after uninstalling) can't leave Radix
            // with a value no trigger/content owns. Absent ?tab= -> first tab.
            validValues={tabs.map((tab) => tab.id)}
            className="w-full"
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="hover:cursor-pointer"
                >
                  {tr(tab.labelKey)}
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
  const tr = useT();
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
    { label: tr('tools.detail.meta.version'), value: meta.version },
    { label: tr('tools.detail.meta.author'), value: meta.author ?? '' },
    {
      label: tr('tools.detail.meta.image'),
      value: meta.image,
      // Manifest stores registry paths without scheme (ghcr.io/...) —
      // force https so the link is always openable and no other scheme
      // (e.g. javascript:) can slip through.
      href: toSafeHttpUrl(meta.image),
    },
    ...(meta.homepage
      ? [
          {
            label: tr('tools.detail.meta.homepage'),
            value: meta.homepage,
            href: toSafeHttpUrl(meta.homepage),
          },
        ]
      : []),
    ...(meta.repositoryUrl
      ? [
          {
            label: tr('tools.detail.meta.repository'),
            value: meta.repositoryUrl,
            href: toSafeHttpUrl(meta.repositoryUrl),
          },
        ]
      : []),
    ...(meta.supportUrl
      ? [
          {
            label: tr('tools.detail.meta.support'),
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
                  <OpenLink
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium break-all text-primary underline-offset-4 hover:underline"
                  >
                    {row.value}
                  </OpenLink>
                ) : (
                  <p className="text-sm font-medium break-all">{row.value}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {pricingTiers.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">
              {tr('tools.detail.meta.pricing')}
            </p>
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
  const tr = useT();
  const queryClient = useQueryClient();
  const toolId = tool.id;
  const navigate = routeApi.useNavigate();
  // The create sheet's open state lives in the URL
  // (?openCreateToolConfiguration=true) so it survives reloads and can be
  // linked to; editing an existing profile stays local.
  const { openCreateToolConfiguration } = routeApi.useSearch();
  const [editingProfile, setEditingProfile] = useState<{
    id: string;
    name: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
  } | null>(null);
  const sheetOpen = editingProfile !== null || Boolean(openCreateToolConfiguration);
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);

  const setCreateSheetOpen = (open: boolean) => {
    navigate({
      search: (prev) => ({
        ...prev,
        openCreateToolConfiguration: open ? true : undefined,
      }),
      replace: true,
    });
  };

  const handleCreate = () => {
    setEditingProfile(null);
    setCreateSheetOpen(true);
  };

  const { data: profilesRaw, isLoading } =
    useToolConfigProfilesControllerList(toolId);

  // Cast to extended shape (orval type is incomplete)
  const profiles = (profilesRaw ?? []) as unknown as ProfileWithMeta[];

  // Dismissing the URL-opened create sheet while the tool has no profile
  // leaves it unusable, so confirm the user will add one later.
  const confirmBeforeDismiss =
    Boolean(openCreateToolConfiguration) &&
    editingProfile === null &&
    profiles.length === 0;

  const { mutate: setDefault, isPending: isSettingDefault } =
    useToolConfigProfilesControllerSetDefault({
      mutation: {
        onSuccess: () => {
          toast.success(tr('tools.detail.profiles.defaultUpdated'));
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : tr('tools.detail.profiles.setDefaultFailed');
          toast.error(msg);
        },
      },
    });

  const { mutate: deleteProfile, isPending: isDeleting } =
    useToolConfigProfilesControllerRemove({
      mutation: {
        onSuccess: () => {
          toast.success(tr('tools.detail.profiles.deleted'));
          queryClient.invalidateQueries({
            queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
          });
          queryClient.invalidateQueries({ queryKey: ['tools'] });
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : tr('tools.detail.profiles.deleteFailed');
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
  };

  // The sheet needs the real Tool object for its header (name, logoUrl)

  return (
    <Card>
      <CardContent>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <CardTitle>{tr('tools.detail.profiles.title')}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {tr('tools.detail.profiles.description')}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {tr('tools.detail.profiles.add')}
          </Button>
        </div>

        {isLoading ? (
          <ConfigProfilesSkeleton />
        ) : profiles.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-4">
            {tr('tools.detail.profiles.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('common.name')}</TableHead>
                <TableHead>{tr('tools.detail.profiles.col.config')}</TableHead>
                <TableHead>{tr('tools.detail.profiles.col.created')}</TableHead>
                <TableHead className="w-[120px]">
                  {tr('common.actions')}
                </TableHead>
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
                          {tr('tools.detail.profiles.default')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-muted-foreground text-sm">
                    {maskConfig(profile.config)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(profile.createdAt, 'dd MMM yyyy')}
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
                          {tr('tools.detail.profiles.setDefault')}
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
                        title={tr('tools.detail.profiles.deleteTitle')}
                        description={tr('tools.detail.profiles.deleteConfirm', {
                          name: profile.name,
                        })}
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
            if (open) return;
            setEditingProfile(null);
            if (openCreateToolConfiguration) setCreateSheetOpen(false);
          }}
          onDismiss={
            confirmBeforeDismiss ? () => setConfirmSkipOpen(true) : undefined
          }
          tool={tool}
          initialData={editingProfile ?? undefined}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: getToolConfigProfilesControllerListQueryKey(toolId),
            });
          }}
        />

        <ConfirmDialog
          open={confirmSkipOpen}
          onOpenChange={setConfirmSkipOpen}
          title={tr('tools.detail.profiles.skipTitle')}
          description={tr('tools.detail.profiles.skipDescription', {
            name: tool.name,
          })}
          confirmText={tr('tools.detail.profiles.skipConfirm')}
          cancelText={tr('tools.detail.profiles.skipCancel')}
          onConfirm={() => setCreateSheetOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
