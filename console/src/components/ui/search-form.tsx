import { Card, CardContent } from "@/components/ui/card";
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
  useSearchControllerGetSearchHistory,
  useSearchControllerSearchAssetsTargets,
} from "@/services/apis/gen/queries";
import { Separator } from "@radix-ui/react-select";
import { keepPreviousData } from "@tanstack/react-query";
import { Clock, CloudCheck, FileText, Search, Target } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const debouncedValue = useDebounce(searchValue, 300);
  const [historyPage, setHistoryPage] = useState(1);
  const [resultPage, setResultPage] = useState(1);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return (
    <form {...props} className="hidden lg:block w-2/3">
      <SidebarGroup className="py-0 w-full">
        <SidebarGroupContent className="relative">
          <div className="w-full">
            <Label htmlFor="search" className="sr-only">
              Search
            </Label>
            <SidebarInput
              id="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search"
              className="pl-8"
              onFocus={() => setIsDropdownOpen(true)}
              ref={inputRef}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />

            {isDropdownOpen && (
              <div ref={dropdownRef}>
                <ResultCard
                  value={debouncedValue}
                  setSearchValue={setSearchValue}
                  setIsDropdownOpen={setIsDropdownOpen}
                  inputRef={inputRef}
                  historyPage={historyPage}
                  setHistoryPage={setHistoryPage}
                  resultPage={resultPage}
                  setResultPage={setResultPage}
                />
              </div>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  );
}

const ResultCard = React.memo(
  ({
    value,
    inputRef,
    setSearchValue,
    setIsDropdownOpen,
    historyPage,
    setHistoryPage,
    resultPage,
    setResultPage,
  }: {
    value: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    setSearchValue: (value: string) => void;
    setIsDropdownOpen: (value: boolean) => void;
    historyPage: number;
    setHistoryPage: (value: number) => void;
    resultPage: number;
    setResultPage: (value: number) => void;
  }) => {
    const { selectedWorkspace } = useWorkspaceSelector();
    const [isOpen, setIsOpen] = useState(false);

    const [currentRow, setCurrentRow] = useState(null);
    const navigate = useNavigate();

    const { data: historyData, refetch } = useSearchControllerGetSearchHistory(
      {
        workspaceId: selectedWorkspace?.toString() || "",
        page: historyPage,
      },
      {
        query: {
          placeholderData: keepPreviousData,
        },
      },
    );

    console.log(historyData);

    const { data: searchData } = useSearchControllerSearchAssetsTargets(
      {
        value: value,
        workspaceId: selectedWorkspace?.toString() || "",
        page: resultPage,
      },
      {
        query: {
          enabled: !!value,
          placeholderData: keepPreviousData,
        },
      },
    );

    const isShowingResult = !!value && searchData;

    React.useEffect(() => {
      if (!value) refetch();
    }, [value, refetch]);

    return (
      <div className="absolute z-10 mt-2 w-full">
        <Card className="p-2">
          <CardContent className="p-0 px-2">
            {isShowingResult ? (
              <div>
                {searchData.data["targets"].length > 0 && (
                  <div className="p-4 pb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Targets
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchData.data["targets"].map(
                        (e: { id: string; value: string }) => (
                          <div
                            key={e.id}
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                            onClick={() => {
                              navigate(`/targets/${e.id}`);
                              setIsDropdownOpen(false);
                              inputRef.current?.blur();
                            }}
                          >
                            <div className="size-2 rounded-full bg-emerald-500" />
                            <span className="text-gray-900 dark:text-gray-100 truncate">
                              {e.value}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {searchData.data["targets"].length > 0 &&
                  searchData.data["assets"].length > 0 && (
                    <Separator className="mx-4" />
                  )}

                {searchData.data["assets"].length > 0 && (
                  <div className="p-4 pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <CloudCheck className="size-4 text-blue-600 dark:text-blue-400" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Assets
                      </span>
                    </div>
                    <div className="space-y-1">
                      {searchData.data["assets"].map((e: any) => (
                        <div
                          key={e.id}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                          onClick={() => {
                            setCurrentRow(e);
                            setIsOpen(true);
                          }}
                        >
                          <div className="size-2 rounded-full bg-blue-500" />
                          <span className="text-gray-900 dark:text-gray-100 truncate">
                            {e.value}
                          </span>
                        </div>
                      ))}
                      <AssetDetailSheet
                        open={isOpen}
                        setOpen={setIsOpen}
                        currentRow={currentRow}
                      />
                    </div>
                  </div>
                )}

                {searchData.pageCount > 1 && (
                  <div className="flex justify-center">
                    <Pagination
                      page={resultPage}
                      pageCount={searchData.pageCount}
                      setPage={setResultPage}
                    />
                  </div>
                )}

                {searchData.data["targets"].length === 0 &&
                  searchData.data["assets"].length === 0 && (
                    <div className="p-6 text-center">
                      <FileText className="size-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 dark:text-gray-400">
                        No results found for "{value}"
                      </p>
                    </div>
                  )}
              </div>
            ) : historyData && historyData.total > 0 ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="size-4 text-gray-500" />
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    Recent Searches
                  </span>
                </div>
                <div className="space-y-1">
                  {historyData.data.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
                      onClick={() => setSearchValue(e.filters["value"])}
                    >
                      <Search className="size-4 text-gray-400 group-hover:text-gray-600" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {e.filters["value"]}
                      </span>
                    </div>
                  ))}
                  {historyData.pageCount > 1 && (
                    <div className="flex justify-center">
                      <Pagination
                        page={historyData.page}
                        pageCount={historyData.pageCount}
                        setPage={setHistoryPage}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <Clock className="size-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">
                  No search history yet
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Start searching to see your history here
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  },
);

function Pagination({
  page,
  pageCount,
  setPage,
}: {
  page: number;
  pageCount: number;
  setPage: (value: number) => void;
}) {
  const getPaginationPages = () => {
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
      (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2,
    );

    const mergedPages: (number | "...")[] = [];
    pages.forEach((curr, i) => {
      if (i === 0 || curr - pages[i - 1] === 1) {
        mergedPages.push(curr);
      } else {
        mergedPages.push("...", curr);
      }
    });

    return mergedPages;
  };
  return (
    pageCount > 0 && (
      <div className="flex flex-row-reverse justify-end items-center">
        <PaginationContent>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage(page - 1);
                }}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>

            {getPaginationPages().map((p, idx) =>
              p === "..." ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === page}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(p);
                    }}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage(page + 1);
                }}
                className={
                  page >= pageCount ? "pointer-events-none opacity-50" : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </PaginationContent>
      </div>
    )
  );
}
