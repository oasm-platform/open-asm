import Image from '@/components/ui/image';

interface IntegrationLogoProps {
  url: string;
}

export function IntegrationLogo({ url }: IntegrationLogoProps) {
  return (
    <div className="light:bg-black dark:bg-white rounded-lg p-[3px]">
      <Image url={url} height={24} width={24} />
    </div>
  );
}
