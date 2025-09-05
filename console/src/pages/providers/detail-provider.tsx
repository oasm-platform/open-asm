import Page from '@/components/common/page';
import { CreateToolDialog } from '@/components/tools/create-tool-dialog';
import { ToolApiKeyDialog } from '@/components/tools/tool-api-key-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServerDataTable } from '@/hooks/useServerDataTable';
import type { Tool } from '@/services/apis/gen/queries';
import {
  ToolsControllerGetManyToolsType,
  useProvidersControllerDeleteProvider,
  useProvidersControllerGetProvider,
  useToolsControllerGetManyTools,
} from '@/services/apis/gen/queries';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

// Define columns for tools table
const toolColumns: ColumnDef<Tool>[] = [
  {
    accessorKey: "logoUrl",
    header: "",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center">
        {row.getValue("logoUrl") ? (
          <div className="w-30 p-1 h-12 bg-white rounded flex items-center justify-center">
            <img
              src={row.getValue("logoUrl")}
              alt={row.getValue("name")}
              className=" object-contain"
            />
          </div>
        ) : (
          <div className="w-30 p-1 h-12 bg-white rounded flex items-center justify-center">
            <span className="text-xs text-gray-500">No Logo</span>
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => {
      const value: string = row.getValue("category");
      if (!value) return <div>-</div>;

      // Replace underscores with spaces and capitalize first letter
      const formattedValue = value.replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      return (
        <Badge variant="secondary">
          {formattedValue}
        </Badge>
      );
    },
  },
  {
    accessorKey: "version",
    header: "Version",
    cell: ({ row }) => {
      const value: string = row.getValue("version");
      return <div>{value || "-"}</div>;
    },
  },
  {
    id: "apiKey",
    header: "API",
    cell: ({ row }) => {
      if (row.original.type === ToolsControllerGetManyToolsType.built_in) {
        return <Button variant="outline" disabled>Built-in</Button>
      }
      return (
        <ToolApiKeyDialog
          tool={row.original}
        />
      );
    },
  },
];

// Define tabs configuration
const TABS = [
  { value: 'information', label: 'Information' },
  { value: 'tools', label: 'Tools' },
];

export function DetailProvider() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tab = searchParams.get('tab');

  const {
    tableParams: { page, pageSize, sortBy, sortOrder },
    tableHandlers: { setPage, setPageSize, setSortBy, setSortOrder },
  } = useServerDataTable();

  const {
    data: provider,
    isLoading,
    error,
  } = useProvidersControllerGetProvider(id || '', {
    query: { enabled: !!id },
  });

  const { mutate: deleteProvider, isPending: isDeleting } = useProvidersControllerDeleteProvider();

  const {
    data: toolsData,
    isLoading: toolsLoading,
  } = useToolsControllerGetManyTools(
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

  // Determine active tab, default to "information" if not specified
  const activeTab = TABS.some((t) => t.value === tab) ? tab : 'information';

  // Handle tab change
  const handleTabChange = (value: string) => {
    // Create new search params with the selected tab
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', value);
    navigate(`?${newSearchParams.toString()}`);
  };

  // Handle provider deletion
  const handleDeleteProvider = () => {
    deleteProvider(
      { id: id || '' },
      {
        onSuccess: () => {
          toast.success('Provider deleted successfully');
          navigate('/providers');
        },
        onError: (error) => {
          toast.error('Failed to delete provider');
          console.error('Error deleting provider:', error);
        },
      }
    );
  };

  // Handle provider edit
  const handleEditProvider = () => {
    navigate(`/providers/${id}/edit`);
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
        <h2 className="text-xl font-semibold">Provider not found</h2>
        <p className="text-muted-foreground mt-2">
          The provider you're looking for doesn't exist or you don't have
          permission to view it.
        </p>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  const tools = toolsData?.data || [];
  const totalTools = toolsData?.total || 0;

  return (
    <Page
      isShowButtonGoBack
      header={
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {provider.logoUrl && (
              <img
                src={provider.logoUrl}
                alt={provider.name}
                className="w-10 h-10 rounded-full object-contain"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">{provider.name}</h1>
              <p className="text-muted-foreground text-sm">{provider.company}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(provider.websiteUrl || '', '_blank')}
              disabled={!provider.websiteUrl}
            >
              Visit Website
            </Button>
            <CreateToolDialog providerId={id || ''}>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create Tool
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
                  <span>Edit</span>
                </DropdownMenuItem>
                <ConfirmDialog
                  title="Delete Provider"
                  description={`Are you sure you want to delete the provider "${provider.name}"? This action cannot be undone.`}
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
                      <span className="text-red-600">Delete</span>
                    </DropdownMenuItem>
                  }
                  confirmText="Delete"
                  cancelText="Cancel"
                  disabled={isDeleting}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    >
      <Tabs
        value={activeTab!}
        onValueChange={handleTabChange}
        className="w-full my-6"
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="hover:cursor-pointer"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="information">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <h2 className="text-lg font-semibold mb-2">Description</h2>
              <p className="text-muted-foreground">
                {provider.description || 'No description available.'}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Code</h3>
                <p>{provider.code}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  Support Email
                </h3>
                <p>{provider.supportEmail || 'N/A'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  API Docs
                </h3>
                {provider.apiDocsUrl ? (
                  <a
                    href={provider.apiDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    View Documentation
                  </a>
                ) : (
                  <p>N/A</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  License
                </h3>
                <p>{provider.licenseInfo || 'N/A'}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tools">
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
              setSortBy(col);
              setSortOrder(order);
            }}
            totalItems={totalTools}
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default DetailProvider;