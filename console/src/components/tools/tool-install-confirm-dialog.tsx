import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import LogoFrame from '@/components/ui/logo-frame';
import ToolLogo from '@/components/ui/tool-logo';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import {
  ToolsControllerGetManyToolsType,
  useToolsControllerGetConnectorBySlug,
  type Tool,
} from '@/services/apis/gen/queries';
import { ChevronRight, Download } from 'lucide-react';
import { useState, type JSX, type ReactNode } from 'react';

interface SchemaProperty {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  format?: unknown;
  items?: { type?: unknown };
}

interface SchemaInput {
  key: string;
  title?: string;
  type: string;
  description?: string;
  required: boolean;
}

function formatSchemaType(prop: SchemaProperty): string {
  const typeName = (type: unknown) =>
    Array.isArray(type) ? type.join(' | ') : typeof type === 'string' ? type : 'any';
  const base =
    prop.type === 'array' && prop.items?.type
      ? `${typeName(prop.items.type)}[]`
      : typeName(prop.type);
  return typeof prop.format === 'string' ? `${base} (${prop.format})` : base;
}

/** Flattens a JSON Schema's top-level properties, required inputs first. */
function listSchemaInputs(
  schema: Record<string, unknown> | undefined,
): SchemaInput[] {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object') return [];
  const required = Array.isArray(schema.required) ? schema.required : [];

  return Object.entries(properties as Record<string, SchemaProperty>)
    .map(([key, prop]) => ({
      key,
      title: typeof prop?.title === 'string' ? prop.title : undefined,
      type: formatSchemaType(prop ?? {}),
      description:
        typeof prop?.description === 'string' ? prop.description : undefined,
      required: required.includes(key),
    }))
    .sort((a, b) => Number(b.required) - Number(a.required));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 py-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

interface ToolInstallConfirmDialogProps {
  tool: Pick<Tool, 'name' | 'logoUrl' | 'type'>;
  onConfirm: () => void;
  /** Element that opens the dialog, e.g. an Install button. */
  trigger: JSX.Element;
}

/**
 * Confirm step before installing a tool in the current workspace: tool -> OASM
 * header, the target workspace, then what the tool is and every input it
 * receives on each run, so the user sees what they grant before confirming.
 *
 * Self-contained: connector metadata and the workspace name are fetched here
 * (from the shared query cache), so callers only pass the tool and a trigger.
 */
export function ToolInstallConfirmDialog({
  tool,
  onConfirm,
  trigger,
}: ToolInstallConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  const isConnector = tool.type === ToolsControllerGetManyToolsType.connector;
  // Connector tools are stored with name = manifest slug.
  const { data: connector } = useToolsControllerGetConnectorBySlug(tool.name, {
    query: { enabled: open && isConnector, retry: false },
  });

  const { workspaces, selectedWorkspace } = useWorkspaceSelector();
  const workspaceName = workspaces.find(
    (ws) => ws.id === selectedWorkspace,
  )?.name;

  const about = connector?.description ?? connector?.shortDescription;
  const inputs = listSchemaInputs(connector?.inputsSchema);

  // Connector names are lowercase slugs (gitleaks); capitalize for display.
  const displayName = tool.name.charAt(0).toUpperCase() + tool.name.slice(1);
  const toolName = (
    <span className="font-semibold text-foreground">{displayName}</span>
  );

  const handleConfirm = () => {
    onConfirm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="items-center gap-4 text-center">
          <div className="flex items-center gap-3">
            <LogoFrame className="shrink-0 overflow-hidden">
              <ToolLogo name={tool.name} logoUrl={tool.logoUrl} size={56} />
            </LogoFrame>
            {/* Chevrons brighten toward OASM: the tool is joining the platform. */}
            <div aria-hidden="true" className="flex text-muted-foreground">
              {[0.25, 0.45, 0.65, 0.85, 1].map((opacity) => (
                <ChevronRight
                  key={opacity}
                  className="-mx-[5px] size-4"
                  style={{ opacity }}
                />
              ))}
            </div>
            <LogoFrame className="shrink-0 overflow-hidden">
              <img
                src="/logo.png"
                alt="OASM Platform"
                width={56}
                height={56}
                className="size-14 object-contain"
              />
            </LogoFrame>
          </div>
          <div className="space-y-1">
            <DialogTitle>Install {displayName}</DialogTitle>
            <DialogDescription>
              Review what this tool receives before you confirm.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 divide-y overflow-y-auto rounded-xl bg-muted/50 px-4">
          {workspaceName && (
            <Section title="Workspace">
              <p className="text-sm text-muted-foreground">
                {toolName} will be installed into workspace{' '}
                <span className="font-medium text-foreground">
                  {workspaceName}
                </span>
                .
              </p>
            </Section>
          )}

          {about && (
            <Section title="About">
              <p className="text-sm text-muted-foreground">{about}</p>
            </Section>
          )}

          {inputs.length > 0 && (
            <Section title="Data shared with this tool">
              <p className="text-sm text-muted-foreground">
                Each time it runs, {toolName} receives the following inputs
                from OASM.
              </p>
              <ul className="mt-3 space-y-3">
                {inputs.map((input) => (
                  <li key={input.key} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {input.title ?? input.key}
                      </span>
                      {input.title && (
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                          {input.key}
                        </code>
                      )}
                      <Badge variant="outline">{input.type}</Badge>
                      {input.required && (
                        <Badge variant="secondary">Required</Badge>
                      )}
                    </div>
                    {input.description && (
                      <p className="text-sm text-muted-foreground">
                        {input.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="You are always in control">
            <p className="text-sm text-muted-foreground">
              You can uninstall {toolName} from its tool page at any time.
            </p>
          </Section>
        </div>

        <Button
          size="lg"
          className="h-11 w-full rounded-xl text-base font-semibold shadow-sm"
          onClick={handleConfirm}
        >
          <Download className="size-[18px]" />
          Install
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default ToolInstallConfirmDialog;
