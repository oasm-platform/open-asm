import Page from '@/components/common/page';
import { ToolApiKeyDialog } from '@/components/tools/tool-api-key-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Image from '@/components/ui/image';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerGetToolById,
} from '@/services/apis/gen/queries';
import { Group, Verified } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ToolInstallButton from './tool-install-button';

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedWorkspace } = useWorkspaceSelector();

  const {
    data: toolResponse,
    isLoading,
    error,
    refetch,
  } = useToolsControllerGetToolById(id || '', {
    query: {
      queryKey: [selectedWorkspace, id],
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

  // Format category name for display
  const formatCategory = (category: string | undefined) => {
    if (!category) return 'N/A';
    return category
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Page>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Logo section - moved to the left */}

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
                  </div>
                  <div className="flex-shrink-0 flex-col md:flex-row flex md:items-center gap-2">
                    <div className="flex gap-2">
                      <ToolApiKeyDialog tool={tool} />
                      <ToolInstallButton
                        tool={tool}
                        workspaceId={selectedWorkspace || ''}
                        onInstallChange={handleInstallChange}
                      />
                    </div>
                    {(isInstalled || tool.isInstalled) &&
                      tool.type !==
                        ToolsControllerGetManyToolsType.built_in && (
                        <Link to={`/assets/groups?toolId=${tool.id}`}>
                          <Button>
                            <Group /> Add to group
                          </Button>
                        </Link>
                      )}
                  </div>
                </div>

                <p className="text-muted-foreground">
                  {tool.description || 'No description available.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  {/* <Badge variant="secondary" className="gap-1">
                    <Hash className="w-3 h-3" />
                    Version: {tool.version || "N/A"}
                  </Badge> */}
                  <Badge variant="secondary" className="gap-1">
                    Category: {formatCategory(tool.category)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    Type:{' '}
                    {tool.type === ToolsControllerGetManyToolsType.built_in
                      ? 'Built-in'
                      : 'Provider'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>
    </Page>
  );
}
