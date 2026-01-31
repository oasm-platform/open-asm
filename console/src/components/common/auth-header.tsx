import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import Logo from '../ui/logo';

export default function AuthHeader() {
  const { data: metadata } = useRootControllerGetMetadata();
  return (
    <div className="flex gap-2 items-center justify-center">
      <Logo logoPath={metadata?.logoPath as string} width={40} height={40} />
      <b className="text-2xl truncate">{metadata?.name || 'OASM'}</b>
    </div>
  );
}
