"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CreateWorkspace = () => {
    return (
        <div className="flex items-center justify-center px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Create Workspace</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="flex flex-col gap-4">
                        <Input
                            name="name"
                            placeholder="Workspace Name"
                            required
                        />
                        <Textarea
                            name="description"
                            placeholder="Description"
                            rows={4}
                        />
                        <Button type="submit">Create Workspace</Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default CreateWorkspace;
