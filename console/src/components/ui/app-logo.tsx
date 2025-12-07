import { Radar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSidebar } from './sidebar';

interface AppLogoProps {
  type: 'small' | 'large';
}
export default function AppLogo({ type }: AppLogoProps) {
  const { state, isMobile } = useSidebar();
  return (
    <Link to={'/'} className="flex h-13 justify-start items-center gap-2">
      <Radar size={type === 'small' ? 25 : 40} />
      {(state === 'expanded' || isMobile) && <b className="text-xl">OASM</b>}
    </Link>
  );
}
