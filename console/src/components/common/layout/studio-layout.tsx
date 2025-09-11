import { Button } from '@/components/ui/button';
import { GithubBadge } from '@/components/ui/github-badge';
import { ArrowLeft } from 'lucide-react';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';

export default function StudioLayout({ children }: { children: JSX.Element }) {
  return (
    <div className="[--header-height:calc(--spacing(14))] flex flex-col h-screen overflow-y-hidden">
      <header className="sticky top-0 z-50 flex shrink-0 items-center gap-2 border-b bg-background">
        <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
          <div>
            <Button variant={'outline'}>
              <ArrowLeft size={4} />
              <Link to="/">Back</Link>
            </Button>
          </div>
          <div className="ml-auto flex gap-3">
            <GithubBadge />
          </div>
        </div>
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
