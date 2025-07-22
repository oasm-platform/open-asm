import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import type { Target } from "@/services/apis/gen/queries";
import { JobStatus, useTargetsControllerDeleteTargetFromWorkspace, useTargetsControllerReScanTarget } from "@/services/apis/gen/queries";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, RefreshCcwDot, Trash2Icon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SettingTarget = ({ target }: { target: Target }) => {
    const { selectedWorkspace } = useWorkspaceSelector()
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const { mutate: deleteTarget } = useTargetsControllerDeleteTargetFromWorkspace({
        mutation: {
            onSuccess: () => {
                queryClient.refetchQueries({
                    queryKey: ["targets"],
                })
            },
        },
    })

    const { mutate: rediscoverTarget } = useTargetsControllerReScanTarget()
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <ConfirmDialog
                    title="Re-discover target"
                    description="Are you sure you want to re-discover this target?"
                    onConfirm={() => {
                        rediscoverTarget({
                            id: target.id,
                        })
                        navigate(-1)
                    }}
                    trigger={
                        <DropdownMenuItem disabled={target.status !== JobStatus.completed}
                            className="cursor-pointer"
                        >
                            <RefreshCcwDot className="mr-1 h-4 w-4" />  Re-discover
                        </DropdownMenuItem>
                    }
                />
                <ConfirmDialog
                    title="Delete target"
                    description="Are you sure you want to delete this target?"
                    onConfirm={() => {
                        deleteTarget({
                            id: target.id,
                            workspaceId: selectedWorkspace ?? "",
                        })
                        navigate(-1)
                    }}
                    trigger={
                        <DropdownMenuItem
                            className="cursor-pointer"
                        >
                            <Trash2Icon className="mr-1 h-4 w-4" />  Delete
                        </DropdownMenuItem>
                    }
                />
            </DropdownMenuContent>
        </DropdownMenu>
    )
};

export default SettingTarget;