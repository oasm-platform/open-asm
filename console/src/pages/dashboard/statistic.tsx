import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetStatistics } from '@/services/apis/gen/queries';
import { Bug, CloudCheck, Cpu, Target } from 'lucide-react';

export default function Statistic() {
    const { selectedWorkspace } = useWorkspaceSelector();

    const { data: statistics, isLoading, isError } = useStatisticControllerGetStatistics({
        workspaceId: selectedWorkspace ?? ''
    }, {
        query: {
            enabled: !!selectedWorkspace,
            refetchInterval: 5000, // Auto refresh every 5 seconds
        }
    });

    // Loading state - show skeleton cards
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, index) => (
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

    if (isError || !selectedWorkspace) {
        return (
            <div className="text-red-500">
                {isError ? "Error loading statistics" : "Please select a workspace"}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-medium text-base">Targets</CardTitle>
                    <Target className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">
                        <NumberAnimate value={statistics?.totalTargets || 0} />
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-medium text-base">Assets</CardTitle>
                    <CloudCheck className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">
                        <NumberAnimate value={statistics?.totalAssets || 0} />
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-medium text-base">Vulnerabilities</CardTitle>
                    <Bug className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">
                        <NumberAnimate value={statistics?.totalVulnerabilities || 0} />
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-medium text-base">Technologies</CardTitle>
                    <Cpu className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">
                        <NumberAnimate value={statistics?.totalUniqueTechnologies || 0} />
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}