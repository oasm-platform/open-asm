import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Save, Key } from 'lucide-react';

interface LLMConfigCardProps {
  provider: {
    id: string;
    name: string;
    icon: string;
  };
  apiKey: string;
  selectedModel: string;
  isConfigured: boolean;
  isUpdating: boolean;
  availableModels: Array<{ id: string; name: string }>;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function LLMConfigCard({
  provider,
  apiKey,
  selectedModel,
  isConfigured,
  isUpdating,
  availableModels,
  onApiKeyChange,
  onModelChange,
  onSave,
  onDelete,
}: LLMConfigCardProps) {
  return (
    <Card className="overflow-hidden border-2 transition-all hover:border-primary/50">
      <CardHeader className="bg-muted/50 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Key size={18} />
            </div>
            <div>
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              <CardDescription>Bring your own API key</CardDescription>
            </div>
          </div>
          {isConfigured && (
            <div className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
              Active
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-key`}>API Key</Label>
            <div className="flex gap-2">
              <Input
                id={`${provider.id}-key`}
                type="password"
                placeholder={
                  isConfigured ? '••••••••••••••••' : 'Enter your API key'
                }
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-model`}>Default Model</Label>
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger id={`${provider.id}-model`}>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="_none" disabled>
                    No models found. Add API key first.
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {isConfigured && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 size={16} className="mr-2" />
                Remove
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={isUpdating || !apiKey}>
              <Save size={16} className="mr-2" />
              {isConfigured ? 'Update' : 'Save Config'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
