import { Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

export interface AiButtonProps extends Omit<ButtonProps, 'color' | 'children'> {
  /**
   * Accent color, any CSS color: `#8b5cf6`, `var(--primary)`, `oklch(…)`.
   * Fills solid variants; tints the icon, border and hover of the others.
   * Defaults to the primary color, so AI buttons look alike across the app;
   * `null` keeps the variant's own colors.
   */
  color?: string | null;
  /** Defaults to the Sparkles icon; `null` shows none */
  icon?: ReactNode;
  /** Text beside the icon; leave out for an icon-only button (give it an `aria-label`) */
  label?: ReactNode;
  /** Classes of the label, e.g. `hidden md:inline` to show only the icon on small screens */
  labelClassName?: string;
}

const AI_PRIMARY_COLOR = 'var(--primary)';

const SOLID_VARIANTS = new Set(['default', 'destructive']);

/** Accent classes per variant kind, all driven by the `--ai-color` variable */
const SOLID_COLOR_CLASSES =
  'bg-(--ai-color) text-white hover:bg-(--ai-color)/90 dark:bg-(--ai-color) dark:hover:bg-(--ai-color)/90';
const TINTED_COLOR_CLASSES = cn(
  '[&_svg]:text-(--ai-color)',
  'hover:bg-(--ai-color)/10 dark:hover:bg-(--ai-color)/15',
  'aria-pressed:bg-(--ai-color)/10 dark:aria-pressed:bg-(--ai-color)/15',
);
const OUTLINE_COLOR_CLASSES =
  'border-(--ai-color)/40 dark:border-(--ai-color)/40 aria-pressed:border-(--ai-color)/70';

/**
 * Button for AI actions: an icon (Sparkles by default) and a label, in any
 * Button variant, with an optional accent color. `aria-pressed` marks it on
 * when it toggles something.
 */
export function AiButton({
  color = AI_PRIMARY_COLOR,
  icon,
  label,
  labelClassName,
  variant = 'outline',
  className,
  style,
  ...props
}: AiButtonProps) {
  const isSolid = SOLID_VARIANTS.has(variant ?? 'default');

  return (
    <Button
      variant={variant}
      className={cn(
        !color && 'aria-pressed:bg-accent aria-pressed:text-accent-foreground',
        color && (isSolid ? SOLID_COLOR_CLASSES : TINTED_COLOR_CLASSES),
        color && variant === 'outline' && OUTLINE_COLOR_CLASSES,
        className,
      )}
      style={
        color ? ({ '--ai-color': color, ...style } as CSSProperties) : style
      }
      {...props}
    >
      {icon === undefined ? <Sparkles /> : icon}
      {label && <span className={labelClassName}>{label}</span>}
    </Button>
  );
}
