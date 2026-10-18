// Shared by every sidebar (main, settings, admin, AI Studio) so spacing stays
// identical. Collapsed (icon) mode keeps px-2: the rail is only 3.5rem wide.
export const sidebarSectionPadding = 'px-3 group-data-[collapsible=icon]:px-2';
export const sidebarMenuClassName =
  'gap-0.5 group-data-[collapsible=icon]:gap-1';
export const sidebarItemClassName =
  'h-9 rounded-lg px-2.5 text-[13px] font-medium hover:cursor-pointer data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-semibold';
export const sidebarGroupLabelClassName =
  'h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70';
