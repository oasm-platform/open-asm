import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import type { LLMConfigWithProviderDto } from '@/services/apis/gen/queries';
import {
  useAgentsControllerGetLLMConfigs,
  useAgentsControllerSetPreferredLLMConfig,
} from '@/services/apis/gen/queries';
import { Bot, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Separator } from './separator';

export function LlmConfigSwitcher() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const itemHeightClass = 'h-10';

  const { data: providers, isLoading } =
    useAgentsControllerGetLLMConfigs<LLMConfigWithProviderDto[]>();

  const { mutate: setPreferred } = useAgentsControllerSetPreferredLLMConfig();

  const connectedProviders = (providers ?? []).filter((p) => p.isConnected);
  const preferredProvider = connectedProviders.find((p) => p.isPreferred);
  const selectedProvider = preferredProvider ?? connectedProviders[0];

  const handleSelectConfig = (configId: string, configName: string) => {
    setPreferred(
      { id: configId },
      {
        onSuccess: () => {
          toast.success(`Switched to ${configName}`);
        },
        onError: (error) => {
          toast.error('Failed to switch provider');
          console.error('Error switching provider:', error);
        },
      },
    );
  };

  const handleConnect = () => {
    void navigate('/agents/providers/connect');
  };

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className={`${itemHeightClass} w-full`} />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="border">
        <SidebarMenuButton
          size="lg"
          className={`${itemHeightClass} data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground`}
        >
          <Bot className="h-5 w-5" />
          <div className="flex flex-col gap-0.5 leading-none ml-2">
            <span className="font-semibold">
              {selectedProvider ? selectedProvider.providerName : 'No provider'}
            </span>
            {selectedProvider?.model && (
              <span className="text-xs text-muted-foreground">
                {selectedProvider.model}
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-auto" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-(--radix-dropdown-menu-trigger-width) p-2"
      >
        {connectedProviders.length > 0 ? (
          <>
            {connectedProviders.map((provider) => (
              <DropdownMenuItem
                key={provider.providerId}
                onSelect={(event) => {
                  if (isMobile) {
                    event.preventDefault();
                  }
                  if (provider.configId) {
                    handleSelectConfig(
                      provider.configId,
                      provider.model ?? provider.providerName,
                    );
                  }
                }}
                className="px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {provider.providerName}
                  </span>
                  {provider.model && (
                    <span className="text-xs text-muted-foreground">
                      {provider.model}
                    </span>
                  )}
                </div>
                {provider.isPreferred && <Check size={16} />}
              </DropdownMenuItem>
            ))}
            <Separator className="my-1" />
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground px-2 py-4">
            No LLM provider configured
          </div>
        )}

        <DropdownMenuItem onClick={handleConnect}>
          <Plus size={16} className="mr-2" />
          Connect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
