import { NewBadge as BaseNewBadge } from '@/components/common/new-badge';
import { useT } from '@/lib/i18n-dictionary';

/**
 * Marks a row found by the latest finished scan of its kind on its target,
 * with the same badge the menu bar uses for new pages. An aggregate row (a
 * port) that is only partly new passes `count` instead and reads "N new".
 * Renders nothing otherwise, so a cell can always include it.
 */
export function NewBadge({ isNew, count }: { isNew?: boolean; count?: number }) {
  const t = useT();
  if (isNew) {
    return <BaseNewBadge title={t('assets.newBadge.title')} />;
  }
  if (count && count > 0) {
    return (
      <BaseNewBadge
        title={t('assets.newBadge.partialTitle', { count })}
      >
        {t('assets.newBadge.count', { count })}
      </BaseNewBadge>
    );
  }
  return null;
}
