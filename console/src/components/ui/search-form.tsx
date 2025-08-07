import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import {
  useSearchControllerDeleteSearchHistory,
  useSearchControllerGetSearchHistory,
} from "@/services/apis/gen/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData } from "@tanstack/react-query";
import { HistoryIcon, Search, X } from "lucide-react";
import * as React from "react";
import { useForm, type UseFormSetValue } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Form, FormField } from "./form";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const formSchema = z.object({
  value: z.string().min(1),
});

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  // const { selectedWorkspace } = useWorkspaceSelector();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });
  const navigate = useNavigate();

  // const { data, refetch } = useSearchControllerSearchAssetsTargets(
  //   {
  //     value: form.watch("value"),
  //     workspaceId: selectedWorkspace?.toString() || "",
  //   },
  //   { query: { enabled: false } },
  // );

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
                {/* FIX: make trigger only open popover content */}
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
                  <DropdownCard setValue={form.setValue} />
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
  ({ setValue }: { setValue: UseFormSetValue<{ value: string }> }) => {
    const { selectedWorkspace } = useWorkspaceSelector();
    //TODO:: invalidate queries after mutate
    const { mutate } = useSearchControllerDeleteSearchHistory();

    const { data: historyData } = useSearchControllerGetSearchHistory(
      {
        workspaceId: selectedWorkspace?.toString() || "",
      },
      {
        query: {
          placeholderData: keepPreviousData,
        },
      },
    );

    console.log(historyData);

    return (
      <>
        <div className="space-y-1">
          {historyData && historyData.total > 0 ? (
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
                    mutate({ id: e.id });
                  }}
                />
              </div>
            ))
          ) : (
            <div className="flex justify-center items-center p-6">
              <HistoryIcon className="size-10 mr-2" />
              <div>
                <p>Your search history is empty</p>
                <span>Search something to continue</span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  },
);
