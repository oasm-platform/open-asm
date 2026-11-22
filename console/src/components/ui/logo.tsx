import { useT } from '@/lib/i18n-dictionary';
import { resolveClientUrl } from '@/utils/storage-url';

interface LogoProps {
  width?: number;
  height?: number;
  logoPath?: string;
}
/**
 * App logo `<img>`: renders absolute storage URLs verbatim, resolves
 * legacy relative `/...` values against the app origin.
 */
export default function Logo({ width, height, logoPath }: LogoProps) {
  const t = useT();
  const src = resolveClientUrl(logoPath) ?? '/logo.png';
  return (
    <img src={src} alt={t('components.logo.alt')} width={width} height={height} className="rounded-md" />
  );
}
