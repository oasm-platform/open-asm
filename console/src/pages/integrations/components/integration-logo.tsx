import Image from '@/components/ui/image';
import LogoFrame from '@/components/ui/logo-frame';

interface IntegrationLogoProps {
  url: string;
}

export function IntegrationLogo({ url }: IntegrationLogoProps) {
  return (
    <LogoFrame>
      <Image url={url} height={24} width={24} />
    </LogoFrame>
  );
}
