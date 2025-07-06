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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useTargetsControllerCreateTarget, useTargetsControllerGetTargetsInWorkspace } from "@/services/apis/gen/queries";
import { Loader2Icon, Target } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;

type FormValues = {
    value: string;
};

export function CreateTarget() {
    const [open, setOpen] = useState(false);
    const { selectedWorkspace } = useWorkspaceSelector()
    const { refetch } = useTargetsControllerGetTargetsInWorkspace(
        selectedWorkspace ?? "", {}, {
        query: {
            queryKey: [selectedWorkspace]
        }
    }
    )
    const {
        register,
        handleSubmit,
        formState: { errors },
        reset,
    } = useForm<FormValues>();

    const { mutate, isPending } = useTargetsControllerCreateTarget(
        {
            mutation: {
                onSuccess: () => {
                    refetch();
                    setOpen(false);
                    reset();
                }
            }
        }
    )

    function onSubmit(data: FormValues) {
        selectedWorkspace && mutate({
            data: {
                value: data.value,
                workspaceId: selectedWorkspace
            }
        }, {
            onError: () => {
                toast.error("Failed to create target")
            },
            onSuccess: () => {
                toast.success("Target created successfully")
            }
        })
        // reset moved to onSuccess
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Target />
                    Start discovery
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Start discovery</DialogTitle>
                    <DialogDescription>
                        Enter the domain you want to scan.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 mb-3">
                        <div className="grid gap-3">
                            <Label htmlFor="name-1">Target</Label>
                            <Input
                                id="name-1"
                                placeholder="e.g. example.com"
                                autoComplete="off"
                                {...register("value", {
                                    required: "Domain is required.",
                                    validate: value =>
                                        domainRegex.test(value.trim()) ||
                                        "Please enter a valid domain name (no IP addresses).",
                                })}
                            />
                            {errors.value && (
                                <span className="text-sm text-red-500">{errors.value.message}</span>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </DialogClose>
                        <Button disabled={isPending} type="submit">
                            {isPending && <Loader2Icon className="animate-spin" />}
                            Start</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

