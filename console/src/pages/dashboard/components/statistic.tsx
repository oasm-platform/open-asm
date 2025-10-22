import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberAnimate } from '@/components/ui/number-animate';
import { useStatistics } from '@/hooks/useStatistics';
import { useTimelineTrend } from '@/hooks/useTimelineTrend';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { CloudCheck, Cpu, EthernetPort, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Statistic() {
    const { selectedWorkspace } = useWorkspaceSelector();
    const navigate = useNavigate();

    const { statistics, isLoading } = useStatistics(selectedWorkspace);

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

    const statsCards = [
        {
            title: 'Targets',
            icon: <Target className="h-5 w-5 text-primary" />,
            value: statistics?.targets || 0,
            path: '/targets',
            trend: calculateTrend('targets')
        },
        {
            title: 'Assets',
            icon: <CloudCheck className="h-5 w-5 text-primary" />,
            value: statistics?.assets || 0,
            path: '/assets',
            trend: calculateTrend('assets')
        },
        {
            title: 'Technologies',
            icon: <Cpu className="h-5 w-5 text-primary" />,
            value: statistics?.techs || 0,
            path: '/assets',
            trend: calculateTrend('techs')
        },
        {
            title: 'Ports',
            icon: <EthernetPort className="h-5 w-5 text-primary" />,
            value: statistics?.ports || 0,
            path: '/assets',
            trend: calculateTrend('ports')
        },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
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
