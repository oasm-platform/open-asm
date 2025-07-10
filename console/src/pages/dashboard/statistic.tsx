import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useWorkspacesControllerGetWorkspaceStatistics } from "@/services/apis/gen/queries";

const Statistic = () => {
    const { selectedWorkspace } = useWorkspaceSelector()
    const { data, isLoading } = useWorkspacesControllerGetWorkspaceStatistics(selectedWorkspace ?? "")
    if (isLoading) return <></>
    return (


        < div className="col-span-4 lg:col-span-3 grid gap-6 md:grid-cols-2 lg:grid-cols-2" >
            {/* Total Targets */}
            <Card>
                <CardHeader>
                    <CardTitle>Total Targets</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold">{data?.totalTargets?.toString() ?? "0"}</p>
                </CardContent>
            </Card>

            {/* Total Assets */}
            <Card>
                <CardHeader>
                    <CardTitle>Total Assets</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold">{data?.totalAssets?.toString() ?? "0"}</p>

                </CardContent>
            </Card>


            {/* Status Codes (1/3) + CNAME Records (2/3) */}
            < div className="col-span-2 grid grid-cols-3 gap-6" >
                {/* Status Codes */}
                < Card className="col-span-1" >
                    <CardHeader>
                        <CardTitle>Status Codes ({(data?.statusCodes as string[])?.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {(data?.statusCodes as (string | number)[])?.map((code) => {
                                const codeStr = code.toString(); // convert to string
                                let variant: "secondary" | "success" | "warning" | "destructive" = "secondary";
                                if (codeStr.startsWith("2")) variant = "success";       // green
                                else if (codeStr.startsWith("3")) variant = "warning";  // yellow
                                else if (codeStr.startsWith("4") || codeStr.startsWith("5")) variant = "destructive"; // red
                                return <Badge variant={variant as any} key={codeStr}>{codeStr}</Badge>;
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* CNAME Records */}
                <Card className="col-span-2" >
                    <CardHeader>
                        <CardTitle>CNAME Records ({(data?.cnameRecords as string[])?.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {(data?.cnameRecords as string[])?.map((record) => (
                                <pre key={record} className="text-sm">{record}</pre>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div >

            {/* Technologies */}
            <Card className="col-span-2" >
                <CardHeader>
                    <CardTitle>Detected Technologies ({(data?.technologies as string[])?.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {(data?.technologies as string[])?.map((tech) => (
                            <Badge variant="outline" key={tech}>{tech}</Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div >



    );
};

export default Statistic;