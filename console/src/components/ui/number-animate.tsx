import React, { useEffect, useRef } from 'react';

interface NumberAnimateProps {
  value: number;
  className?: string;
}

export const NumberAnimate: React.FC<NumberAnimateProps> = ({ value, className }) => {
  const elementRef = useRef<HTMLSpanElement>(null);
  const startTimeRef = useRef<number>(0);
  const duration = 1000;
  useEffect(() => {
    if (!elementRef.current) return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Use integer interpolation to avoid decimal numbers
      const currentValue = Math.floor(progress * value);

      if (elementRef.current) {
        elementRef.current.textContent = currentValue.toString();
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    startTimeRef.current = 0;
    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span ref={elementRef} className={className}>
      0
    </span>
  );
};