import { useLLMConfigs } from '@/hooks/use-llm-configs';
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
import { Check, ChevronsUpDown, Settings } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import Image from './image';
import { Separator } from './separator';

export function LlmConfigSwitcher() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const itemHeightClass = 'h-10';

  const {
    connectedProviders,
    preferredProvider,
    isLoading,
    refetch,
    setPreferredConfig: setPreferred,
  } = useLLMConfigs();

  const selectedProvider = preferredProvider ?? connectedProviders[0];

  const handleSelectConfig = (configId: string, configName: string) => {
    setPreferred.mutate(
      { id: configId },
      {
        onSuccess: () => {
          toast.success(`Switched to ${configName}`);
          void refetch();
        },
        onError: (error) => {
          toast.error('Failed to switch provider');
          console.error('Error switching provider:', error);
        },
      },
    );
  };

  const handleConnect = () => {
    void navigate({ to: '/agents/providers/connect' });
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
          <Image
            url={selectedProvider?.logo}
            height={20}
            className="bg-white rounded p-1"
          />
          <div className="flex gap-0.5 leading-none">
            <span className="hidden md:inline font-semibold mr-2">
              {selectedProvider ? '' : 'No provider'}
            </span>
            {selectedProvider?.model && (
              <span className="text-muted-foreground">
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
                className="py-1.5 rounded hover:bg-muted flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <Image
                    url={provider?.logo}
                    height={30}
                    className="bg-white rounded p-1"
                  />
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
          <Settings size={16} className="mr-2" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
