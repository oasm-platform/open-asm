import { useT } from '@/lib/i18n-dictionary';
import { ShieldX } from 'lucide-react';

/**
 * Fallback rendered by <Page permission="..."> when the current user does not
 * hold the required permission key in the selected workspace.
 */
export default function AccessDenied() {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <ShieldX className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-foreground">
          {t('components.accessDenied.title')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('components.accessDenied.description')}
        </p>
      </div>
    </div>
  );
}
