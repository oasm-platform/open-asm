import { useStatistics } from '@/hooks/useStatistics';
import { useEffect, useState } from 'react';

/** Grade bands of the 0–100 security score, best first. */
const GRADES = [
  { min: 90, grade: 'A', stroke: 'stroke-green-500', text: 'text-green-500' },
  { min: 80, grade: 'B', stroke: 'stroke-lime-500', text: 'text-lime-500' },
  { min: 70, grade: 'C', stroke: 'stroke-yellow-500', text: 'text-yellow-500' },
  { min: 60, grade: 'D', stroke: 'stroke-orange-500', text: 'text-orange-500' },
  { min: 0, grade: 'F', stroke: 'stroke-red-500', text: 'text-red-500' },
];

export default function Score() {
  const { statistics, isLoading } = useStatistics();
  const [animatedOffset, setAnimatedOffset] = useState(2 * Math.PI * 70);

  useEffect(() => {
    if (!isLoading && statistics) {
      const radius = 70;
      const circumference = 2 * Math.PI * radius;
      setAnimatedOffset(
        circumference - (statistics.score / 100) * circumference,
      );
    }
  }, [statistics, isLoading]);

  // Calculate stroke dasharray values for the circular progress
  const radius = 70; // Increased from 60 to make circle even bigger
  const circumference = 2 * Math.PI * radius;
  const scoreValue = statistics?.score || 0;
  const strokeDasharray = circumference;
  const band = GRADES.find((g) => scoreValue >= g.min) ?? GRADES[GRADES.length - 1];

  return (
    <div className="flex items-center justify-center flex-grow">
      {isLoading ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <div
          className="relative"
          title="Starts at 100 and drops with open vulnerabilities, worst first. An open critical caps the grade at D, an open high at B. Info findings don't count."
        >
          <svg
            width="170"
            height="170"
            viewBox="0 0 170 170"
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
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={animatedOffset}
              strokeLinecap="round"
              className={`${band.stroke} transition-all duration-1000 ease-in-out`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground">Security score</span>
            <span className={`text-4xl font-bold ${band.text}`}>
              {band.grade}
            </span>
            <span className="text-sm font-mono text-muted-foreground">
              {scoreValue}/100
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
