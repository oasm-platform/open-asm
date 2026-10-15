import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, type CSSProperties } from 'react';

interface BorderBeamProps {
  /**
   * Bump to play one lap (0 renders nothing). Each new value restarts the
   * animation, e.g. a counter incremented on focus.
   */
  playKey: number;
  /** Seconds for one lap around the border. */
  duration?: number;
  /** Beam thickness in px. */
  width?: number;
  /** Match the host's radius, e.g. `rounded-2xl`. */
  className?: string;
  /** Fires when a lap ends; right away when the user prefers reduced motion. */
  onComplete?: () => void;
}

// Mostly transparent with a short gradient tail: rotating `from` makes the
// coloured segment travel around the border.
const BEAM_GRADIENT =
  'conic-gradient(from var(--beam-angle), transparent 0deg 200deg, #38bdf8 260deg, #818cf8 310deg, #e879f9 350deg, transparent 360deg)';

// Paints the padding box only: the content box is cut out, leaving a ring.
const RING_MASK = 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)';

/**
 * A gradient beam that runs once around the border of its positioned parent,
 * then fades out. Draws over the host without blocking pointer events.
 */
export function BorderBeam({
  playKey,
  duration = 1.4,
  width = 2,
  className,
  onComplete,
}: BorderBeamProps) {
  const reduceMotion = useReducedMotion();

  // No lap is drawn with reduced motion, so report it done straight away.
  useEffect(() => {
    if (playKey && reduceMotion) onComplete?.();
  }, [playKey, reduceMotion, onComplete]);

  if (!playKey || reduceMotion) return null;

  return (
    // The glow sits on the parent so the ring mask on the child doesn't clip it.
    <motion.span
      key={playKey}
      aria-hidden="true"
      data-testid="border-beam"
      initial={{ '--beam-angle': '0deg', opacity: 0 }}
      animate={{ '--beam-angle': '360deg', opacity: [0, 1, 1, 0] }}
      transition={{
        '--beam-angle': { duration, ease: 'easeInOut' },
        opacity: { duration, times: [0, 0.1, 0.8, 1] },
      }}
      onAnimationComplete={() => onComplete?.()}
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] drop-shadow-[0_0_6px_rgba(129,140,248,0.6)]',
        className,
      )}
    >
      <span
        className="absolute inset-0 rounded-[inherit]"
        style={
          {
            padding: width,
            background: BEAM_GRADIENT,
            WebkitMask: RING_MASK,
            WebkitMaskComposite: 'xor',
            mask: RING_MASK,
            maskComposite: 'exclude',
          } as CSSProperties
        }
      />
    </motion.span>
  );
}

export default BorderBeam;
