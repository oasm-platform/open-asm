import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetStatistics, useStatisticControllerGetTimelineStatistics } from '@/services/apis/gen/queries';
import { Bug, CloudCheck, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Statistic() {
    const { selectedWorkspace } = useWorkspaceSelector();
    const navigate = useNavigate();

    const { data: statistics, isLoading, isError } = useStatisticControllerGetStatistics({
        workspaceId: selectedWorkspace ?? ''
    }, {
        query: {
            enabled: !!selectedWorkspace,
            refetchInterval: 5000, // Auto refresh every 5 seconds
        }
    });

    const { data: timeline } = useStatisticControllerGetTimelineStatistics();

    // Define type for timeline statistic data
    type TimelineStatistic = {
        id: string;
        assets: number;
        targets: number;
        vuls: number;
        criticalVuls: number;
        highVuls: number;
        mediumVuls: number;
        lowVuls: number;
        infoVuls: number;
        techs: number;
        ports: number;
        createdAt: string;
        updatedAt: string;
    };

    // Function to calculate trend based on the latest two records with different values
    const calculateTrend = (field: keyof TimelineStatistic) => {
        if (!timeline?.data || timeline.data.length < 2) return null;

        // Sort by createdAt to get the latest records
        const sortedData = [...timeline.data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Find the latest value
        const latest = sortedData[0][field] as number;
        // Find the previous value that is different from the latest value
        const previousDifferent = sortedData.find(item => (item[field] as number) !== latest);

        // If no different value found, return no change
        if (!previousDifferent) {
            return {
                difference: 0,
                isIncreasing: false,
                isDecreasing: false
            };
        }

        const previous = previousDifferent[field] as number;
        const difference = latest - previous;

        return {
            difference,
            isIncreasing: difference > 0,
            isDecreasing: difference < 0
        };
    };

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

    const statsCards = [
        {
            title: 'Targets',
            icon: <Target className="h-5 w-5 text-primary" />,
            value: statistics?.totalTargets || 0,
            path: '/targets',
            trend: calculateTrend('targets')
        },
        {
            title: 'Assets',
            icon: <CloudCheck className="h-5 w-5 text-primary" />,
            value: statistics?.totalAssets || 0,
            path: '/assets',
            trend: calculateTrend('assets')
        },
        {
            title: 'Vulnerabilities',
            icon: <Bug className="h-5 w-5 text-primary" />,
            value: statistics?.totalVulnerabilities || 0,
            path: '/vulnerabilities',
            trend: calculateTrend('vuls')
        },
        // {
        //     title: 'Technologies',
        //     icon: <Cpu className="h-5 w-5 text-primary" />,
        //     value: statistics?.totalUniqueTechnologies || 0,
        //     path: '/assets'
        // }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statsCards.map((card, index) => (
                <Card
                    key={index}
                    className="cursor-pointer transition-colors hover:bg-accent/70"
                    onClick={() => card.path && navigate(card.path)}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="font-medium text-base">{card.title}</CardTitle>
                        {card.icon}
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline justify-between">
                            <p className="text-4xl font-bold">
                                <NumberAnimate value={card.value} />
                            </p>
                            {card.trend && (
                                <div className={`flex items-center ${card.trend.isIncreasing ? 'text-green-500' : card.trend.isDecreasing ? 'text-red-500' : 'text-gray-500'}`}>
                                    {card.trend.isIncreasing ? (
                                        <TrendingUp className="h-5 w-5 mr-1" />
                                    ) : card.trend.isDecreasing ? (
                                        <TrendingDown className="h-5 w-5 mr-1" />
                                    ) : null}
                                    <span className="font-medium">
                                        {Math.abs(card.trend.difference)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}