import { useTypewriter } from '@/hooks/use-typewriter';

interface TypewriterTextProps {
  texts: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  className?: string;
}

export default function TypewriterText({
  texts,
  typingSpeed = 50,
  deletingSpeed = 30,
  pauseDuration = 2000,
  className = '',
}: TypewriterTextProps) {
  const displayText = useTypewriter(texts, {
    typingSpeed,
    deletingSpeed,
    pauseDuration,
  });

  return (
    <p className={className}>
      {displayText}
      <span className="ml-0.5 inline-block w-[2px] h-[1.2em] bg-current animate-[blink_1s_step-end_infinite] align-text-bottom" />
    </p>
  );
}
