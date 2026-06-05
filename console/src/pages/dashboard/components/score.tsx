import { useStatistics } from '@/hooks/useStatistics';
import { useEffect, useState } from 'react';

export default function Score() {
  const { statistics, isLoading } = useStatistics();
  const [animatedOffset, setAnimatedOffset] = useState(2 * Math.PI * 70);

  useEffect(() => {
    if (!isLoading && statistics) {
      const radius = 70;
      const circumference = 2 * Math.PI * radius;
      setAnimatedOffset(
        circumference - (statistics.score / 10) * circumference,
      );
    }
  }, [statistics, isLoading]);

  // Function to get color based on score (matches severity palette)
  const getColor = (score: number) => {
    if (score <= 2) return 'var(--chart-5)';
    if (score <= 4) return 'var(--chart-3)';
    if (score <= 6) return 'var(--chart-2)';
    if (score <= 8) return 'var(--chart-4)';
    return 'var(--chart-4)';
  };

  // Calculate stroke dasharray values for the circular progress
  const radius = 70; // Increased from 60 to make circle even bigger
  const circumference = 2 * Math.PI * radius;
  const scoreValue = statistics?.score || 0;
  const strokeDasharray = circumference;

  return (
    <div className="flex items-center justify-center flex-grow">
      {isLoading ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <div className="relative">
          <svg
            width="170"
            height="170"
            viewBox="0 0 170"
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              stroke="var(--border)"
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
              className="transition-all duration-1000 ease-in-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl">Score</span>
            <span className="text-3xl font-bold text-foreground">
              {scoreValue}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
