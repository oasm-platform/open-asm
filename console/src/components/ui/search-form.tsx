import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar";
import useDebounce from "@/hooks/use-debounce";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import AssetDetailSheet from "@/pages/assets/asset-detail-sheet";
import {
  useSearchControllerDeleteSearchHistory,
  useSearchControllerGetSearchHistory,
  useSearchControllerSearchAssetsTargets,
  type Asset,
} from "@/services/apis/gen/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { CloudCheck, HistoryIcon, Search, Target, X } from "lucide-react";
import * as React from "react";
import { useForm, type UseFormSetValue } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Form, FormField } from "./form";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Skeleton } from "./skeleton";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  value: z.string().min(1),
});

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
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
        className="hidden lg:block w-1/2"
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
                  className="mt-1 w-[var(--radix-popover-trigger-width)] p-4"
                >
                  <DropdownCard
                    setValue={form.setValue}
                    value={form.watch("value")}
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
    const { selectedWorkspace } = useWorkspaceSelector();
    const { mutate } = useSearchControllerDeleteSearchHistory();
    const [currentRow, setCurrentRow] = React.useState<Asset>();
    const [open, setOpen] = React.useState(false);

    const debouncedValue = useDebounce(value, 500);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data, isFetching } = useSearchControllerSearchAssetsTargets(
      {
        value: debouncedValue,
        workspaceId: selectedWorkspace?.toString() || "",
        isSaveHistory: false,
      },
      { query: { enabled: value.length > 0 } },
    );

    const {
      data: historyData,
      isFetching: isHistoryFetching,
      queryKey,
    } = useSearchControllerGetSearchHistory({
      workspaceId: selectedWorkspace?.toString() || "",
      query: debouncedValue,
      limit: value.length > 0 ? 3 : 10,
    });

    return (
      <>
        <div className="space-y-1">
          {(isFetching || isHistoryFetching) && (
            <>
              {Array.from({ length: 3 }, () => (
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-6 w-12 rounded-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ))}
            </>
          )}
          {data && historyData && historyData.total == 0 && data.total == 0 && (
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
          {historyData &&
            historyData.total > 0 &&
            historyData.data.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                onClick={() => setValue("value", e.query)}
              >
                <HistoryIcon className="size-4 text-gray-400 group-hover:text-gray-600" />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  {e.query}
                </span>
                <X
                  className="size-6 ml-auto text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-full p-1 transition-colors cursor-pointer"
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
          {value.length > 0 &&
            data &&
            data.data.targets.length > 0 &&
            data.data.targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                onClick={() => navigate("targets/" + target.id)}
              >
                <Target className="size-4 text-gray-400 group-hover:text-gray-600" />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  Target: {target.value}
                </span>
              </div>
            ))}
          {value.length > 0 &&
            data &&
            data.data.assets.length > 0 &&
            data.data.assets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => {
                  setCurrentRow(asset);
                  setOpen(true);
                }}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
              >
                <CloudCheck className="size-4 text-gray-400 group-hover:text-gray-600" />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  Assets: {asset.value}
                </span>
              </div>
            ))}
        </div>
        <AssetDetailSheet
          currentRow={currentRow}
          open={open}
          setOpen={setOpen}
        />
      </>
    );
  },
);
