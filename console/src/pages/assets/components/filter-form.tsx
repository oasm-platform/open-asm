import { Input } from '@/components/ui/input';
import useDebounce from '@/hooks/use-debounce';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function FilterForm() {
  const [params, setParams] = useSearchParams();

  const [searchValue, setSearchValue] = useState(params.get('filter') ?? '');
  const debouncedValue = useDebounce(searchValue, 500);

  useEffect(() => {
    if (debouncedValue) {
      params.set('filter', debouncedValue);
    } else {
      params.delete('filter');
    }
    setParams(params);
  }, [debouncedValue, params, setParams]);

  return (
    <div className="relative w-1/4">
      <Input
        placeholder="Filter value"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
      />
      <Search className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
    </div>
  );
}
