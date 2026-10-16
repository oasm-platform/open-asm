import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Header slot of the settings dialog; null outside it */
export const SettingsHeaderActionsContext = createContext<HTMLElement | null>(
  null,
);

/**
 * Renders a tab's actions in the settings dialog header, next to its label.
 * Outside the dialog (standalone pages, tests) they render in place.
 */
export function SettingsHeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(SettingsHeaderActionsContext);
  if (!slot) return <div className="flex justify-end gap-2">{children}</div>;
  return createPortal(children, slot);
}
