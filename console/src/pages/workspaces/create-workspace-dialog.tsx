"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useWorkspacesControllerCreateWorkspace } from "@/services/apis/gen/queries";
import { Loader2Icon, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type FormData = {
    name: string;
    description: string;
};

const CreateWorkspaceDialog = () => {
    const [open, setOpen] = useState(false);
    const { mutate, isPending } = useWorkspacesControllerCreateWorkspace();

    const { refetch, handleSelectWorkspace } = useWorkspaceSelector()

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

    const onSubmit = (data: FormData) => {
        // TODO: handle create workspace with data
        mutate({
            data: {
                name: data.name,
                description: data.description,
            },
        }, {
            onSuccess: (data) => {
                toast.success("Workspace created successfully")
                refetch().then(() => {
                    handleSelectWorkspace(data.id)
                })
                setOpen(false);
                reset();
            },
            onError: () => {
                toast.error("Failed to create workspace")
            }
        })

    };

    return (
        <div>
            <Button size={"sm"} variant="outline" className="w-full" onClick={() => setOpen(true)}>
                <Plus size={20} />  Create workspace
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Workspace</DialogTitle>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={handleSubmit(onSubmit)}
                    >
                        <Input
                            {...register("name", { required: "Workspace name is required" })}
                            placeholder="Workspace Name"
                        />
                        {errors.name && <p className="text-red-600 text-sm">{errors.name.message}</p>}
                        <Textarea
                            {...register("description")}
                            placeholder="Description"
                            rows={4}
                        />
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2Icon className="animate-spin" />}
                                Create
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CreateWorkspaceDialog;
