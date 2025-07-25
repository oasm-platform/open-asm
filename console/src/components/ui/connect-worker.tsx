import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useWorkspacesControllerRotateApiKey } from "@/services/apis/gen/queries";
import { Copy, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./confirm-dialog";

export function ConnectWorker() {
    const { workspaces, selectedWorkspace, refetch } = useWorkspaceSelector()
    const apiKey = workspaces[workspaces.findIndex((workspace) => workspace.id === selectedWorkspace)]?.apiKey;
    const [open, setOpen] = useState(false);

    const rawCommand = `docker run -d --name open-asm-worker -e API_KEY=${apiKey} -e API=${import.meta.env.VITE_API_URL} -e MAX_JOBS=10 open-asm-worker:latest`;

    const { mutate } = useWorkspacesControllerRotateApiKey({
        mutation: {
            onSuccess: () => {
                toast.success("API key rotated successfully");
                refetch()
            },
            onError: () => {
                toast.error("Failed to rotate API key");
            }
        }
    })

    const handleCopyCommand = async () => {
        await navigator.clipboard.writeText(rawCommand);
        toast.success("Command copied to clipboard");
    };

    const handleCopyApiKey = async () => {
        await navigator.clipboard.writeText(apiKey || "");
        toast.success("API key copied to clipboard");
    };

    if (!selectedWorkspace) return null;
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2">
                    <SquareTerminal className="shrink-0" />
                    <span className="hidden lg:inline">Connect worker</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Connect worker</DialogTitle>
                    <DialogDescription>
                        Copy and paste the following code and API key into your worker:
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <p>API Key:</p>
                    <div className="relative bg-black text-white font-mono rounded-md p-4 text-sm">
                        <pre className="whitespace-pre-wrap">{apiKey}</pre>
                        <Button
                            onClick={handleCopyApiKey}
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 text-white hover:text-gray-300"
                        >
                            <Copy size={16} />
                        </Button>
                    </div>
                    <p>Command:</p>
                    <div className="relative bg-black text-white font-mono rounded-md p-4 text-sm">
                        <pre className="whitespace-pre-wrap">{rawCommand}</pre>
                        <Button
                            onClick={handleCopyCommand}
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 text-white hover:text-gray-300"
                        >
                            <Copy size={16} />
                        </Button>
                    </div>

                </div>
                <DialogFooter className="flex justify-between items-center gap-2">
                    <ConfirmDialog
                        title="Rotate API key"
                        description="Are you sure you want to rotate the API key?"
                        onConfirm={() => mutate({ id: selectedWorkspace })}
                        trigger={<Button variant="outline" type="button">Rotate API key</Button>}
                    />
                    <DialogClose asChild>
                        <Button variant="outline" type="button">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}