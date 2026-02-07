import { cn } from '@/lib/utils';
import { Github } from 'lucide-react';
import { buttonVariants } from './button-variants';

const REPO_URL = 'https://github.com/oasm-platform/open-asm';
export function GithubBadge() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'default' }),
        'gap-2 flex',
      )}
      title="Open GitHub repository"
    >
      <Github className="size-4" />
    </a>
  );
}
