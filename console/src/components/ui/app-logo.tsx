import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from '@/services/apis/gen/queries';
import { Link } from 'react-router-dom';
import Logo from './logo';
import { useSidebar } from './sidebar';

interface AppLogoProps {
  type: 'small' | 'large';
}
export default function AppLogo({ type }: AppLogoProps) {
  const { state, isMobile } = useSidebar();
  const { data: metadata } = useRootControllerGetMetadata({
    query: {
      queryKey: getRootControllerGetMetadataQueryKey(),
    },
  });
  return (
    <Link to={'/'} className="flex h-13 justify-start items-center gap-2">
      <Logo
        logoPath={metadata?.logoPath as string}
        width={type === 'small' ? 25 : 30}
        height={type === 'small' ? 25 : 30}
      />
      {/* {metadata?.logoPath ? (
        <img
          src={metadata?.logoPath}
          alt={metadata?.name || 'OASM'}
          className="h-13 w-13 rounded-md"
        />
      ) : (
        <Radar size={type === 'small' ? 25 : 30} />
      )} */}
      {(state === 'expanded' || isMobile) && (
        <b className="text-xl truncate">{metadata?.name || 'OASM'}</b>
      )}
    </Link>
  );
}
