import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspacesControllerMakeArchived, type Workspace } from "@/services/apis/gen/queries";
import { Tooltip, TooltipContent, TooltipProvider } from "@radix-ui/react-tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveX } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n-dictionary";


interface ArchivedWorkspaceProps {
    workspace: Workspace;
}
const ArchivedWorkspace = (props: ArchivedWorkspaceProps) => {
    const t = useT();
    const queryClient = useQueryClient();

    const { workspace } = props;
    const { archivedAt } = workspace;
    const label = archivedAt ? t('settings.workspace.archive.unarchive') : t('settings.workspace.archive.archive');
    const { mutate } = useWorkspacesControllerMakeArchived()
    const handleArchive = () => {
        // Handle archive action
        mutate({
            id: workspace.id,
            data: {
                isArchived: !archivedAt
            },
        }, {
            onSuccess: () => {
                toast.success(t('settings.workspace.archive.success'))
                queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            },
            onError: () => {
                toast.error(t('settings.workspace.archive.failed'))
            }
        })
    };
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div>
                        <ConfirmDialog
                            title={t('settings.workspace.archive.title')}
                            description={t('settings.workspace.archive.description', { name: workspace.name })}
                            onConfirm={handleArchive}
                            confirmText={label}
                            trigger={
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-muted-foreground/80"
                                >
                                    {archivedAt ? <ArchiveX className="h-4 w-4" /> : <Archive className="h-4 w-4 text-red-500" />}
                                    <span className="sr-only">{label}</span>
                                </Button>
                            }
                        />
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>
                        {archivedAt
                            ? t('settings.workspace.archive.unarchiveTooltip')
                            : t('settings.workspace.archive.archiveTooltip')}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ArchivedWorkspace;