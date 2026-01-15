import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google Gemini' },
];

interface LLMFormProps {
  initialData?: {
    provider: string;
    apiKey: string;
    model: string;
    apiUrl?: string;
  };
  isUpdating: boolean;
  onSubmit: (data: {
    provider: string;
    apiKey: string;
    model: string;
    apiUrl?: string;
  }) => void;
  onCancel: () => void;
  mode: 'add' | 'edit';
}

export function LLMForm({
  initialData,
  isUpdating,
  onSubmit,
  onCancel,
  mode,
}: LLMFormProps) {
  const [provider, setProvider] = useState(initialData?.provider || '');
  const [apiKey, setApiKey] = useState(initialData?.apiKey || '');
  const [model, setModel] = useState(initialData?.model || '');
  const [apiUrl, setApiUrl] = useState(initialData?.apiUrl || '');

  useEffect(() => {
    if (initialData) {
      setProvider(initialData.provider);
      setApiKey(initialData.apiKey);
      setModel(initialData.model);
      setApiUrl(initialData.apiUrl || '');
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ provider, apiKey, model, apiUrl });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="provider">API Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="provider">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API Token</Label>
          <Input
            id="apiKey"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiUrl">API URL (Optional)</Label>
          <Input
            id="apiUrl"
            type="text"
            placeholder="https://api.example.com/v1"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            type="text"
            placeholder="Enter model name"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isUpdating || !provider || !apiKey}>
          {isUpdating
            ? 'Saving...'
            : mode === 'add'
              ? 'Add Provider'
              : 'Update Provider'}
        </Button>
      </div>
    </form>
  );
}
