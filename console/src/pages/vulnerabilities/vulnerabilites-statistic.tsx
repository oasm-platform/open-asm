import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useVulnerabilitiesControllerGetVulnerabilitiesStatistics } from "@/services/apis/gen/queries";
import { AlertTriangle, Bug, Eye, Flame, Info } from "lucide-react";
import { useLocation } from "react-router-dom";

interface VulnerabilitiesStatisticProps {
    targetId?: string;
}
const VulnerabilitiesStatistic = ({ targetId }: VulnerabilitiesStatisticProps) => {
    const { selectedWorkspace } = useWorkspaceSelector();
    const location = useLocation();

    // Extract targetId from URL search params if present
    const urlParams = new URLSearchParams(location.search);
    const urlTargetId = urlParams.get("targetId") || undefined;

    // Use targetId from props if provided, otherwise use from URL
    if (!targetId) {
        targetId = urlTargetId;
    }

    const { data, isLoading } = useVulnerabilitiesControllerGetVulnerabilitiesStatistics(
        {
            workspaceId: selectedWorkspace ?? "",
            ...(targetId ? { targetIds: [targetId] } : {}),
        },
        {
            query: {
                enabled: !!selectedWorkspace,
                refetchInterval: 5000,
            },
        }
    );

    // Create a map of severity to count for easy access
    const severityCounts = data?.data?.reduce((acc, item) => {
        acc[item.severity] = item.count;
        return acc;
    }, {} as Record<string, number>) || {
        info: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
    };

    // Loading state - show skeleton cards
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, index) => (
                    <Card key={index} className="animate-pulse">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="h-4 bg-muted rounded w-16"></div>
                            <div className="h-5 w-5 bg-muted rounded-full"></div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 bg-muted rounded w-8"></div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-red-500 font-medium text-base">Critical</CardTitle>
                    <Flame className="h-5 w-5 text-red-500" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold text-red-500">{severityCounts.critical}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-orange-500 font-medium text-base">High</CardTitle>
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold text-orange-500">{severityCounts.high}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-yellow-500 font-medium text-base">Medium</CardTitle>
                    <Bug className="h-5 w-5 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold text-yellow-500">{severityCounts.medium}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-blue-500 font-medium text-base">Low</CardTitle>
                    <Eye className="h-5 w-5 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold text-blue-500">{severityCounts.low}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-medium text-base">Info</CardTitle>
                    <Info className="h-5 w-5" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">{severityCounts.info}</p>
                </CardContent>
            </Card>
        </div>
    );
};

export default VulnerabilitiesStatistic;