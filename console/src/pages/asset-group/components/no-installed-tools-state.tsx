import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { MoveUpRight, WrenchIcon } from 'lucide-react';

const INSTALL_STEPS = [
  'Open the Tools page and browse the available scanners.',
  'Install a tool and choose its configuration.',
  'Return here and add the tool to the group pipeline.',
];

export function NoInstalledToolsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <WrenchIcon className="size-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">No tools installed yet</h3>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Install a compatible scanner and choose its configuration before
          adding it to this group.
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
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <Button asChild>
        <Link to="/tools">
          Browse and install tools
          <MoveUpRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
