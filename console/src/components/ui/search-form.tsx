import { Label } from '@/components/ui/label';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from '@/components/ui/sidebar';
import useDebounce from '@/hooks/use-debounce';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useSearchControllerDeleteSearchHistory,
  useSearchControllerGetSearchHistory,
  useSearchControllerSearchAssetsTargets,
} from '@/services/apis/gen/queries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CloudCheck, HistoryIcon, Search, Target, X } from 'lucide-react';
import * as React from 'react';
import { useForm, type UseFormSetValue } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Form, FormField } from './form';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { menu } from '@/components/common/layout/menu-bar';

const formSchema = z.object({
  value: z.string().min(1),
});

export function SearchForm({ ...props }: React.ComponentProps<'form'>) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: '',
    },
  });

  const navigate = useNavigate();

  const onSubmit = (formValue: z.infer<typeof formSchema>) => {
    navigate(`/search?query=${formValue.value}`);
  };

  return (
    <Form {...form}>
      <form
        {...props}
        className="hidden lg:block w-1/3"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <SidebarGroup className="py-0 w-full">
          <SidebarGroupContent className="relative">
            <div className="w-full">
              <Label htmlFor="search" className="sr-only">
                Search
              </Label>
              <Popover>
                <PopoverTrigger className="w-full">
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <>
                        <SidebarInput
                          placeholder="Search"
                          className="pl-8"
                          autoComplete="off"
                          {...field}
                        />
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
                      </>
                    )}
                  />
                </PopoverTrigger>
                <PopoverContent
                  onOpenAutoFocus={(e) => {
                    e.preventDefault();
                  }}
                  className="mt-1 w-[var(--radix-popover-trigger-width)] p-2"
                >
                  <DropdownCard
                    setValue={form.setValue}
                    value={form.watch('value')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </form>
    </Form>
  );
}

const DropdownCard = React.memo(
  ({
    setValue,
    value,
  }: {
    setValue: UseFormSetValue<{ value: string }>;
    value: string;
  }) => {
    const {
      state: { selectedWorkspaceId },
    } = useWorkspaceState();
    const { mutate } = useSearchControllerDeleteSearchHistory();

    const debouncedValue = useDebounce(value, 500);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data } = useSearchControllerSearchAssetsTargets(
      {
        value: debouncedValue,
        workspaceId: selectedWorkspaceId || '',
        isSaveHistory: false,
      },
      { query: { enabled: value.length > 0 } },
    );

    const { data: historyData, queryKey } = useSearchControllerGetSearchHistory(
      {
        workspaceId: selectedWorkspaceId || '',
        query: debouncedValue,
        limit: value.length > 0 ? 3 : 10,
      },
    );

    const features = React.useMemo(() => {
      if (value.length === 0) return [];
      const q = value.toLowerCase();
      return menu
        .flatMap((group) => group.items)
        .filter((item) => item.title.toLowerCase().includes(q));
    }, [value]);

    return (
      <>
        <div className="space-y-1">
          {value.length > 0 && features.length === 0 && data && data.total == 0 && (
              <div className="flex justify-center items-center p-6">
                <Search className="size-8 mr-2" />
                <div>
                  <p>No result found</p>
                </div>
              </div>
            )}
          {historyData && historyData.total == 0 && value.length == 0 && (
            <div className="flex justify-center items-center p-6">
              <HistoryIcon className="size-10 mr-2" />
              <div>
                <p>Your search history is empty</p>
                <span>Search something to continue</span>
              </div>
            </div>
          )}
          {value.length === 0 && historyData && historyData.total > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                History
              </div>
              {historyData.data.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                  onClick={() => setValue('value', e.query)}
                  >
                    <HistoryIcon className="size-3 text-gray-400 group-hover:text-gray-600" />
                    <span className="text-gray-700 dark:text-gray-300 text-sm truncate">
                      {e.query}
                    </span>
                    <X
                    className="size-4 ml-auto text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-full p-0.5 transition-colors cursor-pointer"
                    aria-label="Delete search history"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      mutate(
                        { id: e.id },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({
                              queryKey: queryKey,
                            });
                          },
                        },
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {value.length > 0 && features.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                Features
              </div>
              {features.map((item) => (
                <div
                  key={item.url}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                  onClick={() => navigate(item.url)}
                >
                  <span className="size-3 text-gray-400 group-hover:text-gray-600 [&>svg]:size-3">
                    {item.icon}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 text-sm truncate">
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          )}
          {value.length > 0 && data && data.data.targets.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                Targets
              </div>
              {data.data.targets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                  onClick={() => navigate('targets/' + target.id)}
                >
                  <Target className="size-3 text-gray-400 group-hover:text-gray-600" />
                  <span className="text-gray-700 dark:text-gray-300 text-sm truncate">
                    {target.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          {value.length > 0 && data && data.data.assets.length > 0 && (
            <div className="mb-2">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                Assets
              </div>
              {data.data.assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => navigate('assets/' + asset.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer transition-colors group"
                >
                  <CloudCheck className="size-3 text-gray-400 group-hover:text-gray-600" />
                  <span className="text-gray-700 dark:text-gray-300 text-sm truncate">
                    {asset.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  },
);
