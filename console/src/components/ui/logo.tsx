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
  const src = resolveClientUrl(logoPath) ?? '/logo.png';
  return (
    <img src={src} alt="logo" width={width} height={height} className="rounded-md" />
  );
}
