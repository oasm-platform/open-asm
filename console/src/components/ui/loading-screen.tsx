import Logo from '@/components/ui/logo';
import { Spinner } from '@/components/ui/spinner';

interface LoadingScreenProps {
  logoSize?: number;
  spinnerSize?: string;
}

function LoadingScreen({ logoSize = 48, spinnerSize = 'size-6' }: LoadingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Logo width={logoSize} height={logoSize} />
      <Spinner className={spinnerSize} />
    </div>
  );
}

export { LoadingScreen };
