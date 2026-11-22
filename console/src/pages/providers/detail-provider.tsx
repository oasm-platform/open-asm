import Page from '@/components/common/page';
import { CreateToolDialog } from '@/modules/admin/components/create-tool-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { OpenLink } from '@/components/ui/open-link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { Tool } from '@/services/apis/gen/queries';
import {
  useProvidersControllerDeleteProvider,
  useProvidersControllerGetProvider,
  useToolsControllerGetManyTools,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

// Define columns for tools table
const getToolColumns = (t: TFunction): ColumnDef<Tool>[] => [
  {
    accessorKey: 'logoUrl',
    header: '',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center">
        {row.getValue('logoUrl') ? (
          <div className="w-30 p-1 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-400">
            <div className="w-28 h-10 flex items-center justify-center">
              <img
                src={row.getValue('logoUrl')}
                alt={row.getValue('name')}
                className="object-contain max-h-8"
              />
            </div>
          </div>
        ) : (
          <div className="w-30 p-1 h-12 bg-white rounded-lg flex items-center justify-center border border-gray-400">
            <span className="text-xs text-gray-500">
              {t('providers.detail.noLogo')}
            </span>
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: t('common.name'),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue('name')}</div>
    ),
  },
  {
    accessorKey: 'category',
    header: t('providers.detail.category'),
    cell: ({ row }) => {
      const value: string = row.getValue('category');
      if (!value) return <div>-</div>;

      // Replace underscores with spaces and capitalize first letter
      const formattedValue = value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

      return <Badge variant="secondary">{formattedValue}</Badge>;
    },
  },
  {
    accessorKey: 'version',
    header: t('providers.detail.version'),
    cell: ({ row }) => {
      const value: string = row.getValue('version');
      return <div>{value || '-'}</div>;
    },
  },
];

export function DetailProvider() {
  const t = useT();
  const toolColumns = useMemo(() => getToolColumns(t), [t]);
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();

  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setParams },
  } = useServerDataTable();

  const {
    data: provider,
    isLoading,
    error,
  } = useProvidersControllerGetProvider(id || '', {
    query: { enabled: !!id },
  });

  const { mutate: deleteProvider, isPending: isDeleting } =
    useProvidersControllerDeleteProvider();

  const { data: toolsData, isLoading: toolsLoading } =
    useToolsControllerGetManyTools(
      {
        providerId: id,
        limit: pageSize,
        page,
        sortBy,
        sortOrder,
      },
      {
        query: { enabled: !!id },
      },
    );

  // Handle provider deletion
  const handleDeleteProvider = () => {
    deleteProvider(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success(t('providers.detail.deleted'));
          navigate({ to: '/providers' });
        },
        onError: (error) => {
          toast.error(t('providers.detail.deleteFailed'));
          console.error('Error deleting provider:', error);
        },
      },
    );
  };

  // Handle provider edit
  const handleEditProvider = () => {
    navigate({ to: `/providers/${id}/edit` });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">{t('providers.notFound.title')}</h2>
        <p className="text-muted-foreground mt-2">
          {t('providers.notFound.description')}
        </p>
        <Button className="mt-4" onClick={() => window.history.back()}>
          {t('providers.notFound.goBack')}
        </Button>
      </div>
    );
  }

  const tools = toolsData?.data || [];
  const totalTools = toolsData?.total || 0;

  return (
    <Page
      permission="agent.read"
     
      header={
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {/* <div>
              <h1 className="text-2xl font-bold">{provider.name}</h1>
            </div> */}
          </div>
          <div className="flex items-center gap-2">
            {provider.websiteUrl ? (
              <Button asChild variant="outline">
                <OpenLink href={provider.websiteUrl}>
                  {t('providers.detail.visitWebsite')}
                </OpenLink>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                {t('providers.detail.visitWebsite')}
              </Button>
            )}
            <CreateToolDialog providerId={id || ''}>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                {t('providers.detail.createTool')}
              </Button>
            </CreateToolDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="px-2">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEditProvider}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>{t('common.edit')}</span>
                </DropdownMenuItem>
                <ConfirmDialog
                  title={t('providers.detail.deleteTitle')}
                  description={t('providers.detail.deleteConfirm', {
                    name: provider.name,
                  })}
                  onConfirm={handleDeleteProvider}
                  trigger={
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      disabled={isDeleting}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                      )}
                      <span className="text-red-600">{t('common.delete')}</span>
                    </DropdownMenuItem>
                  }
                  confirmText={t('common.delete')}
                  cancelText={t('common.cancel')}
                  disabled={isDeleting}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    >
      {/* Provider Information Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
        <div className="md:col-span-2">
          <div className="flex gap-6 mb-6">
            {provider.logoUrl && (
              <div className="flex-shrink-0">
                <div className="w-24 h-24 rounded-lg border-2 border-muted-800 flex items-center justify-center">
                  <img
                    src={provider.logoUrl}
                    alt={provider.name}
                    className="w-20 h-20 object-contain"
                  />
                </div>
              </div>
            )}
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl font-bold">{provider.name}</h1>
              <p className="text-muted-foreground mb-2">{provider.code}</p>
              {provider.supportEmail && (
                <p className="text-muted-foreground text-sm">
                  {t('providers.detail.supportEmail', { email: provider.supportEmail })}
                </p>
              )}
            </div>
          </div>
          <h2 className="text-lg font-semibold mb-2">
            {t('common.description')}
          </h2>
          <p className="text-muted-foreground">
            {provider.description || t('providers.detail.noDescription')}
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('providers.detail.apiDocs')}
            </h3>
            {provider.apiDocsUrl ? (
              <OpenLink
                href={provider.apiDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {t('providers.detail.viewDocs')}
              </OpenLink>
            ) : (
              <p>N/A</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('providers.detail.license')}
            </h3>
            <p>{provider.licenseInfo || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      <div className="my-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{t('providers.detail.tools')}</h2>
        </div>
        <DataTable
          data={tools}
          columns={toolColumns}
          isLoading={toolsLoading}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSortChange={(col, order) => {
            setParams({ sortBy: col, sortOrder: order });
          }}
          totalItems={totalTools}
        />
      </div>
    </Page>
  );
}

export default DetailProvider;

