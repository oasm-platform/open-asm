import Logo from '@/components/ui/logo';
import { useRootControllerGetMetadata } from '@/services/apis/gen/queries';
import { Navigate } from 'react-router-dom';
import type { JSX } from 'react/jsx-runtime';

interface SplashProps {
    children: JSX.Element
}
export default function Splash({ children }: SplashProps) {
    const { data: metadata, isFetching, isError } = useRootControllerGetMetadata();

    if (isFetching || isError) return <div className="flex items-center justify-center h-screen">
        <Logo width={64} height={64} />
    </div>

    if (metadata && !metadata?.isInit) {
        return <Navigate to="/init-admin" />;
    }
    return <>{children}</>
}