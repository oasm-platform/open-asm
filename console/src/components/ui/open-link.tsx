import {
  forwardRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from 'react';
import { ConfirmDialog } from './confirm-dialog';

/**
 * External links behind a confirmation dialog.
 *
 * `OpenLink` renders a normal `<a>` (same markup/styling as before) but a plain
 * left click asks first. The dialog lives in a single `OpenLinkDialog` mounted
 * at the root, so links keep working inside dropdown menus that unmount on
 * click. Only absolute http(s) URLs are intercepted; `mailto:`, `tel:`,
 * `cursor:` and in-app paths keep their native behaviour.
 */

let pendingHref: string | null = null;
const listeners = new Set<() => void>();

const setPendingHref = (href: string | null) => {
  pendingHref = href;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => pendingHref;

const isExternalUrl = (href: string) => /^(https?:)?\/\//i.test(href);

export type OpenLinkProps = ComponentPropsWithoutRef<'a'>;

export const OpenLink = forwardRef<HTMLAnchorElement, OpenLinkProps>(
  ({ href, target = '_blank', rel = 'noopener noreferrer', onClick, ...props }, ref) => {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      // Native behaviour wins: consumer cancelled it, or the user asked for a
      // new window/tab (ctrl/cmd/shift/alt click) — do not get in the way.
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      if (!href || !isExternalUrl(href)) return;

      event.preventDefault();
      setPendingHref(href);
    };

    return (
      <a
        ref={ref}
        href={href}
        target={target}
        rel={rel}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
OpenLink.displayName = 'OpenLink';

/** Mount once, at the root route. */
export function OpenLinkDialog() {
  const href = useSyncExternalStore(subscribe, getSnapshot);

  return (
    <ConfirmDialog
      open={href !== null}
      onOpenChange={(open) => {
        if (!open) setPendingHref(null);
      }}
      title="Open external link?"
      description="This link will open outside the console."
      confirmText="Open"
      cancelText="Cancel"
      onConfirm={() => {
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
      }}
    >
      {href && (
        <p className="rounded-md bg-muted p-2 font-mono text-xs break-all">
          {href}
        </p>
      )}
    </ConfirmDialog>
  );
}
