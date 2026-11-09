import { Plus, Sparkles, Upload } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { useTemplateTabs } from '../hooks/use-template-tabs';
import { useTemplateUpload } from '../hooks/use-template-upload';
import { AiGenButton } from './ai-gen-button';

const NEW_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘I' : 'Ctrl+I';
const LABEL = 'sr-only sm:not-sr-only';

/** Every way to start a template, in the Templates page header. */
export function TemplatesHeaderActions() {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission('artifact.write');
  const { openNew } = useTemplateTabs();
  const { pick, input } = useTemplateUpload();

  useHotkeys(
    'mod+i',
    (e) => {
      e.preventDefault();
      openNew();
    },
    { enabled: canWrite, enableOnContentEditable: true, enableOnFormTags: true },
  );

  return (
    // Icons only on phones; the labels stay for screen readers.
    <div className="flex shrink-0 gap-2">
      <AiGenButton>
        <Sparkles className="size-4" />
        <span className={LABEL}>AI gen</span>
      </AiGenButton>
      {canWrite && (
        <>
          <Button size="sm" variant="outline" onClick={pick}>
            <Upload /> <span className={LABEL}>Upload</span>
          </Button>
          {input}
          <Button size="sm" onClick={openNew}>
            <Plus /> <span className={LABEL}>New</span>
            <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1 text-xs sm:inline">
              {NEW_SHORTCUT}
            </kbd>
          </Button>
        </>
      )}
    </div>
  );
}
