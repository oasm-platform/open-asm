import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { useState } from 'react';

export function ScanComponent() {
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('');

  const handleScan = () => {
    // Implement scan functionality here
    console.log('Scanning with:', inputValue || selectedOption);
    // For now, we'll just log the values
    // In a real implementation, this would call an API or perform some action
  };

  const predefinedOptions = [
    { value: 'http://example.com', label: 'http://example.com' },
    { value: 'https://api.example.com', label: 'https://api.example.com' },
    { value: 'https://test.example.com', label: 'https://test.example.com' },
  ];

  return (
    <div className="flex items-center gap-2 p-4 border-b">
      <div className="flex-1 flex gap-2 items-center">
        <Select value={selectedOption} onValueChange={setSelectedOption}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select a target" />
          </SelectTrigger>
          <SelectContent>
            {predefinedOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">or</div>
        <Input
          placeholder="Enter custom URL"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1"
        />
      </div>
      <Button onClick={handleScan} className="flex items-center gap-2">
        <Search className="size-4" />
        Scan
      </Button>
    </div>
  );
}
