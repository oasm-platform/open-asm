import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useWorkspacesControllerGetWorkspaceStatistics } from "@/services/apis/gen/queries";
import { Link } from "react-router-dom"; // Import Link

const Statistic = () => {
    const { selectedWorkspace } = useWorkspaceSelector();
    const { data, isLoading } = useWorkspacesControllerGetWorkspaceStatistics(selectedWorkspace ?? "");
    if (isLoading) return <></>;

    return (
        <div className="col-span-4 lg:col-span-3 grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            {/* Total Targets */}
            <Link to="/targets" className="hover:opacity-90 transition">
                <Card className="h-full cursor-pointer">
                    <CardHeader>
                        <CardTitle>Total Targets</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{data?.totalTargets?.toString() ?? "0"}</p>
                    </CardContent>
                </Card>
            </Link>

            {/* Total Assets */}
            <Link to="/assets" className="hover:opacity-90 transition">
                <Card className="h-full cursor-pointer">
                    <CardHeader>
                        <CardTitle>Total Assets</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{data?.totalAssets?.toString() ?? "0"}</p>
                    </CardContent>
                </Card>
            </Link>

            {/* Status Codes + CNAME */}
            <div className="col-span-2 grid grid-cols-3 gap-6">
                {/* Status Codes */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Status Codes ({(data?.statusCodes as string[])?.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {(data?.statusCodes as (string | number)[])?.map((code) => {
                                const codeStr = code.toString();
                                let variant: "secondary" | "success" | "warning" | "destructive" = "secondary";
                                if (codeStr.startsWith("2")) variant = "success";
                                else if (codeStr.startsWith("3")) variant = "warning";
                                else if (codeStr.startsWith("4") || codeStr.startsWith("5")) variant = "destructive";
                                return <Badge variant={variant as any} key={codeStr}>{codeStr}</Badge>;
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* CNAME Records */}
                <Card className="col-span-2">
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
            </div>

            {/* Technologies */}
            <Card className="col-span-2">
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
        </div>
    );
};

export default Statistic;
