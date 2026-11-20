import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n-dictionary';
import { Link } from '@tanstack/react-router';
import { MoveUpRight, WrenchIcon } from 'lucide-react';

const INSTALL_STEPS = [
  'projects.noTools.step1',
  'projects.noTools.step2',
  'projects.noTools.step3',
];

export function NoInstalledToolsState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <WrenchIcon className="size-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t('projects.noTools.title')}</h3>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          {t('projects.noTools.description')}
        </p>
      </div>
      <ol className="grid w-full max-w-3xl gap-3 text-left text-sm text-muted-foreground sm:grid-cols-3">
        {INSTALL_STEPS.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2.5"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-foreground">
              {index + 1}
            </span>
            <span>{t(step)}</span>
          </li>
        ))}
      </ol>
      <Button asChild>
        <Link to="/tools">
          {t('projects.noTools.browse')}
          <MoveUpRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
