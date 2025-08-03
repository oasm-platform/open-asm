import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import type { Target } from "@/services/apis/gen/queries";
import { JobStatus, useTargetsControllerDeleteTargetFromWorkspace, useTargetsControllerReScanTarget } from "@/services/apis/gen/queries";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Clock, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

const SettingTarget = ({ target }: { target: Target }) => {
    const { selectedWorkspace } = useWorkspaceSelector();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRediscovering, setIsRediscovering] = useState(false);

    // Mutation hook to delete a target from the workspace
    const { mutate: deleteTarget } = useTargetsControllerDeleteTargetFromWorkspace({
        mutation: {
            onSuccess: () => {
                queryClient.refetchQueries({
                    queryKey: ["targets"],
                });
                setIsDeleting(false);
            },
            onError: () => setIsDeleting(false),
        },
    });

    // Mutation hook to rediscover/re-scan a target
    const { mutate: rediscoverTarget } = useTargetsControllerReScanTarget({
        mutation: {
            onSettled: () => setIsRediscovering(false),
            onError: () => setIsRediscovering(false),
        },
    });

    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
                <Button 
                    variant="outline" 
                    size="icon"
                    className="h-8 w-8 rounded-full border-border/50 hover:border-border hover:bg-accent hover:text-accent-foreground"
                >
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Target settings</span>
                </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col w-full sm:max-w-md p-0 h-full">
                <SheetHeader className="border-b pb-4">
                    <SheetTitle className="text-lg font-semibold">
                        {target.value}
                    </SheetTitle>
                    <SheetDescription>
                        Manage target configuration and actions
                    </SheetDescription>
                </SheetHeader>
                
                <div className="flex flex-col h-full">
                    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground">ACTIONS</h3>
                            <div className="space-y-2">
                                <ConfirmDialog
                                    title="Re-discover target"
                                    description="This will initiate a new scan of the target. The process might take a few minutes to complete."
                                    onConfirm={() => {
                                        setIsRediscovering(true);
                                        rediscoverTarget({
                                            id: target.id,
                                        });
                                        navigate(`/targets/${target.id}?animation=true&page=1&pageSize=100`);
                                        setIsSheetOpen(false);
                                    }}
                                    trigger={
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start h-12 px-4 text-left hover:bg-accent/50"
                                            disabled={target.status !== JobStatus.completed}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                                    <RefreshCw className={`h-4 w-4 text-blue-600 dark:text-blue-400 ${isRediscovering ? 'animate-spin' : ''}`} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-medium">Re-discover Target</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {target.status === JobStatus.completed 
                                                            ? "Scan the target again for changes" 
                                                            : "Target is currently being processed"}
                                                    </p>
                                                </div>
                                                {target.status !== JobStatus.completed && (
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </div>
                                        </Button>
                                    }
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t p-6 mt-auto">
                        <h3 className="text-sm font-medium text-muted-foreground mb-4">DANGER ZONE</h3>
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                                <div>
                                    <h4 className="font-medium">Delete this target</h4>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        This will permanently delete the target and all its associated data. This action cannot be undone.
                                    </p>
                                    <ConfirmDialog
                                        title="Delete target"
                                        description="This action cannot be undone. This will permanently delete the target and all its data."
                                        onConfirm={() => {
                                            setIsDeleting(true);
                                            deleteTarget({
                                                id: target.id,
                                                workspaceId: selectedWorkspace ?? "",
                                            });
                                            navigate(-1);
                                        }}
                                        trigger={
                                            <Button 
                                                variant="destructive" 
                                                size="sm"
                                                className="w-full sm:w-auto"
                                                disabled={isDeleting}
                                            >
                                                {isDeleting ? (
                                                    <>
                                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                                        Deleting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete Target
                                                    </>
                                                )}
                                            </Button>
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default SettingTarget;

