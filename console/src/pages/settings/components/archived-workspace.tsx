import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspacesControllerMakeArchived, type Workspace } from "@/services/apis/gen/queries";
import { Tooltip, TooltipContent, TooltipProvider } from "@radix-ui/react-tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveX } from "lucide-react";
import { toast } from "sonner";


interface ArchivedWorkspaceProps {
    workspace: Workspace;
}
const ArchivedWorkspace = (props: ArchivedWorkspaceProps) => {
    const queryClient = useQueryClient();

    const { workspace } = props;
    const { archivedAt } = workspace;
    const label = archivedAt ? "Unarchive" : "Archive";
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
                toast.success("Workspace archived successfully")
                queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            },
            onError: () => {
                toast.error("Failed to archive workspace")
            }
        })
    };
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div>
                        <ConfirmDialog
                            title="Archive Workspace"
                            description={`Are you sure you want to archive "${workspace.name}"?`}
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
                    <p>{label} workspace</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default ArchivedWorkspace;