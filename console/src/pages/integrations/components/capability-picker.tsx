import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { CapabilityMeta } from '../capabilities';

interface CapabilityPickerProps {
  capabilities: Record<string, CapabilityMeta>;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

/**
 * Toggles for the capabilities of a multi-capability app. At least one must
 * stay enabled — the last enabled switch is locked on.
 */
export function CapabilityPicker({
  capabilities,
  value,
  onChange,
  disabled,
}: CapabilityPickerProps) {
  const toggle = (capability: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(capability)) onChange([...value, capability]);
      return;
    }
    onChange(value.filter((cap) => cap !== capability));
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Capabilities</Label>
        <p className="text-xs text-muted-foreground">
          One connection, several uses. Enable what this integration should do.
        </p>
      </div>
      {Object.entries(capabilities).map(([capability, meta]) => {
        const id = `capability-${capability}`;
        const checked = value.includes(capability);
        const isLastEnabled = checked && value.length === 1;
        return (
          <div
            key={capability}
            className="flex items-start justify-between gap-3 border-t pt-2"
          >
            <div className="space-y-0.5">
              <Label htmlFor={id} className="text-sm font-normal">
                {meta.title}
              </Label>
              {meta.description && (
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                </p>
              )}
            </div>
            <Switch
              id={id}
              name={id}
              checked={checked}
              disabled={disabled || isLastEnabled}
              onCheckedChange={(next) => toggle(capability, next)}
            />
          </div>
        );
      })}
    </div>
  );
}
