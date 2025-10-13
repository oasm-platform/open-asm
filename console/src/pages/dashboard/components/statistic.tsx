import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetStatistics } from '@/services/apis/gen/queries';
import { CloudCheck, Cpu, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTimelineTrend } from '@/hooks/useTimelineTrend';

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

    const { calculateTrend } = useTimelineTrend();

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
            title: 'Technologies',
            icon: <Cpu className="h-5 w-5 text-primary" />,
            value: statistics?.totalUniqueTechnologies || 0,
            path: '/assets',
            trend: calculateTrend('techs')
        },
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
                            <p className="text-4xl font-bold font-mono">
                                <NumberAnimate value={card.value} />
                            </p>
                            {card.trend && (
                                <div className={`flex items-center ${card.trend.isIncreasing ? 'text-green-500' : card.trend.isDecreasing ? 'text-red-500' : 'text-gray-500'}`}>
                                    {card.trend.isIncreasing ? (
                                        <TrendingUp className="h-5 w-5 mr-1" />
                                    ) : card.trend.isDecreasing ? (
                                        <TrendingDown className="h-5 w-5 mr-1" />
                                    ) : null}
                                    <span className="font-medium font-mono">
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