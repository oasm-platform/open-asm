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
    <Link to={'/'} className="flex h-13 items-center justify-start gap-2.5 shrink-0">
      <Logo
        logoPath={metadata?.logoPath as string}
        width={type === 'small' ? 26 : 30}
        height={type === 'small' ? 26 : 30}
      />
      {showName && (
        <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
          {metadata?.name || 'OASM'}
        </span>
      )}
    </Link>
  );
}
