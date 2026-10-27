import { NewBadge as BaseNewBadge } from '@/components/common/new-badge';

/**
 * Marks a row found by the latest finished scan of its kind on its target,
 * with the same badge the menu bar uses for new pages. An aggregate row (a
 * port) that is only partly new passes `count` instead and reads "N new".
 * Renders nothing otherwise, so a cell can always include it.
 */
export function NewBadge({ isNew, count }: { isNew?: boolean; count?: number }) {
  if (isNew) {
    return <BaseNewBadge title="Found by the latest finished scan" />;
  }
  if (count && count > 0) {
    return (
      <BaseNewBadge
        title={`${count} of its services were found by the latest finished scan`}
      >
        {count} new
      </BaseNewBadge>
    );
  }
  return null;
}
