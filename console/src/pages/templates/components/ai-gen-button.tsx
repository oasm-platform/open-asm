import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';

/**
 * Opening words of the AI Studio chat: the user finishes the sentence with
 * what the template should detect and sends it. Names the built-in skill so
 * the agent loads its template rules.
 */
export const AI_GEN_TEMPLATE_PROMPT =
  'Use the nuclei-template-generator skill to write a Nuclei template that ';

/** Opens a new AI Studio chat with the template request filled in, not sent. */
export function AiGenButton({
  className,
  children,
}: { className?: string; children?: ReactNode } = {}) {
  const { hasPermission } = usePermission();
  if (!hasPermission('agent.read')) return null;
  return (
    <Button size="sm" variant="outline" className={className} asChild>
      <Link
        to="/aistudio"
        search={{ text: AI_GEN_TEMPLATE_PROMPT, autoSubmit: false }}
        title="Write a template with OASM AI Studio"
      >
        {children ?? (
          <>
            <Sparkles className="size-4" />
            AI gen
          </>
        )}
      </Link>
    </Button>
  );
}
