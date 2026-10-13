import { useEffect, useState } from 'react';
import { FilterToolbar } from '@/components/filter-builder/filter-toolbar';
import { DatePickerWithRange } from '@/components/ui/date-picker-range';
import useDebounce from '@/hooks/use-debounce';
import { ASSET_FILTER_FIELDS } from '../asset-filter-fields';
import { useAsset } from '../context/asset-context';

export default function AssetFilterBar() {
  const {
    tableParams: { filter },
    tableHandlers: { setFilter },
    appliedFilter,
    setAppliedFilter,
    dateRange,
    setDateRange,
  } = useAsset();
  const [search, setSearch] = useState(filter ?? '');
  const debounced = useDebounce(search, 500);
  useEffect(() => {
    setFilter(debounced);
  }, [debounced, setFilter]);
  useEffect(() => {
    setSearch(filter ?? ''); // cleared when a tree is applied
  }, [filter]);

  return (
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
      <FilterToolbar fields={ASSET_FILTER_FIELDS} value={appliedFilter} onApply={setAppliedFilter}
        search={search} onSearchChange={setSearch} />
      <DatePickerWithRange label="Date" value={dateRange} onChange={setDateRange} className="w-full md:w-60" />
    </div>
  );
}
