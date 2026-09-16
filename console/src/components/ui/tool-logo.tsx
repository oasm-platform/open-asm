import React, { useMemo, useState } from 'react';

/**
 * Deterministic fallback tiles. Self-contained colors (white letter on a
 * saturated mid-dark background) so they read the same in light and dark mode
 * while keeping WCAG AA contrast for the initial.
 */
const PALETTE = [
  '#4f46e5', // indigo-600
  '#7c3aed', // violet-600
  '#2563eb', // blue-600
  '#0e7490', // cyan-700
  '#047857', // emerald-700
  '#b45309', // amber-700
  '#e11d48', // rose-600
  '#c2410c', // orange-700
  '#db2777', // pink-600
  '#475569', // slate-600
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function firstGrapheme(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';
  return [...trimmed][0].toUpperCase();
}

interface ToolLogoProps {
  /** Tool name — used for the fallback initial and the deterministic color. */
  name: string;
  logoUrl?: string | null;
  /** Tile size in px. Shape comes from `className` (rounded / rounded-full / …). */
  size?: number;
  className?: string;
  alt?: string;
  title?: string;
}

export const ToolLogo: React.FC<ToolLogoProps> = ({
  name,
  logoUrl,
  size = 40,
  className,
  alt,
  title,
}) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const background = useMemo(
    () => PALETTE[hashName(name ?? '') % PALETTE.length],
    [name],
  );
  const letter = useMemo(() => firstGrapheme(name), [name]);

  if (!logoUrl || failedUrl === logoUrl) {
    return (
      <div
        role="img"
        aria-label={alt ?? name}
        title={title ?? name}
        data-tool-logo-fallback=""
        className={`flex rounded-full shrink-0 select-none items-center justify-center font-semibold text-white ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          backgroundColor: background,
          fontSize: Math.round(size * 0.45),
        }}
      >
        {letter}
      </div>
    );
  }

  const isHttpUrl =
    logoUrl.startsWith('http://') || logoUrl.startsWith('https://');
  const isDataUrl = logoUrl.startsWith('data:');
  const src = isHttpUrl || isDataUrl ? logoUrl : `/api${logoUrl}`;

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={alt ?? name}
      title={title ?? name}
      className={`shrink-0 object-cover ${className ?? ''}`}
      style={{ width: size, height: size }}
      onError={() => setFailedUrl(logoUrl)}
    />
  );
};

export default ToolLogo;
