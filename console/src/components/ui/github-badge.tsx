import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Github, Star } from 'lucide-react';

const REPO_API = 'https://api.github.com/repos/oasm-platform/open-asm';
const REPO_URL = 'https://github.com/oasm-platform/open-asm';

type RepoResponse = {
  stargazers_count: number;
};

export function GithubBadge() {
  const { data } = useQuery<RepoResponse>({
    queryKey: ['github', 'repo', 'oasm-platform/open-asm'],
    queryFn: async () => {
      const res = await fetch(REPO_API, {
        headers: {
          // Unauthenticated is fine for public data
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) throw new Error('Failed to load GitHub repo info');
      return (await res.json()) as RepoResponse;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour (React Query v5)
  });

  const stars = data?.stargazers_count ?? undefined;

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
      {typeof stars === 'number' ? (
        <span className="inline-flex items-center gap-1 text-xs">
          <Star className="size-3 fill-yellow-500 stroke-yellow-500" />
          {stars.toLocaleString()}
        </span>
      ) : (
        <span className="text-xs">Star</span>
      )}
    </a>
  );
}
