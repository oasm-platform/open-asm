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
import { useUsersControllerGetApiKey } from "@/services/apis/gen/queries";
import { Copy, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ConnectWorker() {
    const [open, setOpen] = useState(false);
    const { data } = useUsersControllerGetApiKey()
    const rawCommand = `docker run -d --name open-asm-worker open-asm-worker -e API_KEY=${data?.apiKey} -e API=${import.meta.env.VITE_API_URL} -e MAX_JOBS=10`;

    const handleCopyCommand = async () => {
        await navigator.clipboard.writeText(rawCommand);
        toast.success("Command copied to clipboard");
    };

    const handleCopyApiKey = async () => {
        await navigator.clipboard.writeText(data?.apiKey || "");
        toast.success("API key copied to clipboard");
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <SquareTerminal />
                    Connect worker
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
                        <pre className="whitespace-pre-wrap">{data?.apiKey}</pre>
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
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" type="button">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}