import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { PermissionCatalogResourceDto } from '@/services/apis/gen/queries';

interface PermissionGroupFormProps {
  catalog: PermissionCatalogResourceDto[];
  /** All groups in the workspace, used to reject duplicate names */
  groups: Array<{ id: string; name: string }>;
  title: string;
  description: string;
  submitText: string;
  initialName?: string;
  initialPermissions?: string[];
  isPending?: boolean;
  /** Render without the Card wrapper/border (e.g. inside a Sheet) */
  bare?: boolean;
  className?: string;
  onSave: (name: string, permissions: string[]) => void;
  onCancel: () => void;
}

/**
 * Create/edit permission group form. Rendered on its own route
 * (/settings/members/permission-groups/*). Business logic is identical to the
 * previous dialog: name + permission key checkboxes grouped by resource.
 */
export function PermissionGroupForm({
  catalog,
  groups,
  title,
  description,
  submitText,
  initialName = '',
  initialPermissions = [],
  isPending = false,
  bare = false,
  className,
  onSave,
  onCancel,
}: PermissionGroupFormProps) {
  const [name, setName] = useState(initialName);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialPermissions);

  const toggleKey = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const canSave =
    name.trim().length > 0 &&
    !groups.some(
      (group) =>
        group.name === name.trim() &&
        !(initialName && group.name === initialName),
    );

  const formContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          placeholder="Viewer"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Permissions</Label>
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Loading permission catalog...
          </p>
        ) : (
          <div className="space-y-3">
            {catalog.map((resource) => {
              const resourceKeys = resource.actions.map(
                (item) => `${resource.resource}.${item.action}`,
              );
              const selectedCount = resourceKeys.filter((key) =>
                selectedKeys.includes(key),
              ).length;
              const allSelected = selectedCount === resourceKeys.length;
              const someSelected = selectedCount > 0 && !allSelected;
              return (
                <div key={resource.resource}>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setSelectedKeys((current) =>
                        allSelected
                          ? current.filter((key) => !resourceKeys.includes(key))
                          : Array.from(
                              new Set([...current, ...resourceKeys]),
                            ),
                      )
                    }
                  >
                    <Checkbox
                      checked={
                        someSelected ? 'indeterminate' : allSelected
                      }
                      className="pointer-events-none"
                    />
                    {resource.resource}
                  </button>
                  <div className="mt-1 grid gap-1">
                    {resource.actions.map((item) => {
                      const key = `${resource.resource}.${item.action}`;
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={selectedKeys.includes(key)}
                            onCheckedChange={() => toggleKey(key)}
                          />
                          <span className="font-medium">{item.action}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedKeys.map((key) => (
            <Badge key={key} variant="secondary">
              {key}
              <button
                type="button"
                className="ml-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => toggleKey(key)}
                aria-label={`Remove ${key}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'mx-auto w-full space-y-4 sm:w-3/4 xl:w-1/2',
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {bare ? (
        formContent
      ) : (
        <Card>
          <CardContent className="space-y-4">{formContent}</CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!canSave || isPending}
          onClick={() => onSave(name.trim(), selectedKeys)}
        >
          {isPending ? 'Saving...' : submitText}
        </Button>
      </div>
    </div>
  );
}
