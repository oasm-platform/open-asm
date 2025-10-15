import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
    useWorkspacesControllerGetWorkspaceConfigs,
    useWorkspacesControllerUpdateWorkspaceConfigs,
    type GetWorkspaceConfigsDto,
    type SwaggerPropertyMetadataValue,
    type UpdateWorkspaceConfigsDto,
} from '@/services/apis/gen/queries';

export function WorkspaceConfigs() {
    const { selectedWorkspace } = useWorkspaceSelector();
    const { data: configs, isLoading, refetch } = useWorkspacesControllerGetWorkspaceConfigs({
        query: {
            enabled: selectedWorkspace !== undefined,
            queryKey: [selectedWorkspace],
        }
    });
    const { mutate: updateWorkspaceConfigs, isPending: isUpdating } = useWorkspacesControllerUpdateWorkspaceConfigs();

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[...Array(3)].map((_, index) => (
                    <div key={index} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-[200px]" />
                        <Skeleton className="h-8 w-[70px]" />
                    </div>
                ))}
            </div>
        );
    }

    const handleChangeConfig = (
        key: keyof GetWorkspaceConfigsDto,
        value: string | number | boolean
    ) => {
        if (!configs) return;

        const newConfig = Object.entries(configs).reduce((result, [k, cfg]) => {
            // Copy current value
            if (cfg?.value !== undefined) {
                (result as SwaggerPropertyMetadataValue)[k] = cfg.value;
            }

            // Apply changed key
            if (k === key) {
                (result as SwaggerPropertyMetadataValue)[k] = value;
            }

            return result;
        }, {} as Record<string, string | number | boolean>);

        updateWorkspaceConfigs(
            {
                data: newConfig as UpdateWorkspaceConfigsDto,
            },
            {
                onSuccess: () => {
                    refetch();
                },
            }
        );
    };

    return (
        <Card className="space-y-4 p-4 w-full lg:w-3/4 xl:w-1/2 2xl:w-1/3">
            {configs &&
                Object.entries(configs).map(([key, config]) => (
                    <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={key} className="flex flex-col items-start cursor-pointer">
                            <span className="font-bold">{config?.title || key}</span>
                            {config?.description && (
                                <span className="text-gray-500 text-sm">
                                    {String(config.description)}
                                </span>
                            )}
                        </Label>
                        {!isLoading && (
                            <div>
                                {config.type === 'boolean' ? (
                                    <Switch
                                        disabled={isUpdating}
                                        id={key}
                                        checked={Boolean(config.value)}
                                        onCheckedChange={(checked) =>
                                            handleChangeConfig(key as keyof GetWorkspaceConfigsDto, checked)
                                        }
                                    />
                                ) : (
                                    <Input
                                        id={key}
                                        disabled={isUpdating}
                                        type={config.type}
                                        value={String(config.value ?? '')}
                                        onChange={(e) =>
                                            handleChangeConfig(
                                                key as keyof GetWorkspaceConfigsDto,
                                                e.target.value
                                            )
                                        }
                                        className="w-[200px]"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                ))}
        </Card>
    );
}
