import { Card, CardContent } from '@/components/ui/card';
import { useStatistics } from '@/hooks/useStatistics';
import { useEffect, useState } from 'react';

export default function Score() {
    const { statistics, isLoading } = useStatistics();
    const [animatedOffset, setAnimatedOffset] = useState(2 * Math.PI * 70);
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        if (!hasAnimated && !isLoading && statistics) {
            const radius = 70;
            const circumference = 2 * Math.PI * radius;
            setAnimatedOffset(circumference - (statistics.score / 10) * circumference);
            setHasAnimated(true);
        }
    }, [statistics, isLoading, hasAnimated]);

    // Function to get color based on score (red -> yellow -> green)
    const getColor = (score: number) => {
        if (score <= 2) return '#ef4444'; // red-500
        if (score <= 4) return '#f97316'; // orange-500
        if (score <= 6) return '#eab308'; // yellow-500
        if (score <= 8) return '#84cc16'; // lime-500
        return '#22c55e'; // green-500
    };

    // Calculate stroke dasharray values for the circular progress
    const radius = 70; // Increased from 60 to make circle even bigger
    const circumference = 2 * Math.PI * radius;
    const scoreValue = statistics?.score || 0;
    const strokeDasharray = circumference;

    return (
        <Card className='gap-1 p-3'>
            <CardContent className="flex items-center justify-center p-0 flex-grow">
                {isLoading ? (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-500">Loading...</p>
                    </div>
                ) : (
                    <div className="relative">
                        <svg width="170" height="170" viewBox="0 0 170" className="transform -rotate-90">
                            {/* Background circle */}
                            <circle
                                cx="85"
                                cy="85"
                                r={radius}
                                stroke="#e5e7eb"
                                strokeWidth="8"
                                fill="transparent"
                            />
                            {/* Progress circle */}
                            <circle
                                cx="85"
                                cy="85"
                                r={radius}
                                stroke={getColor(scoreValue)}
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={animatedOffset}
                                strokeLinecap="round"
                                className="transition-all duration-500 ease-in-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className='text-xl'>Score</span>
                            <span className="text-3xl font-bold text-foreground">
                                {scoreValue.toFixed(1)}
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
