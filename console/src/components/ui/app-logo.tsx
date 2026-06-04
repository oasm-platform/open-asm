import {
  getRootControllerGetMetadataQueryKey,
  useRootControllerGetMetadata,
} from '@/services/apis/gen/queries';
import { Link } from '@tanstack/react-router';
import * as React from 'react';
import Logo from './logo';
import { SidebarContext } from './sidebar';

interface AppLogoProps {
  type: 'small' | 'large';
}
export default function AppLogo({ type }: AppLogoProps) {
  const sidebar = React.useContext(SidebarContext);
  const showName = !sidebar || sidebar.state === 'expanded' || sidebar.isMobile;
  const { data: metadata } = useRootControllerGetMetadata({
    query: {
      queryKey: getRootControllerGetMetadataQueryKey(),
    },
  });
  return (
    <Link to={'/'} className="flex h-13 justify-start items-center gap-2 shrink-0">
      <Logo
        logoPath={metadata?.logoPath as string}
        width={type === 'small' ? 25 : 30}
        height={type === 'small' ? 25 : 30}
      />
      {showName && <b className="text-xl truncate">{metadata?.name || 'OASM'}</b>}
    </Link>
  );
}
