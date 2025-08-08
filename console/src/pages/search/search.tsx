import {
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useSearchControllerSearchAssetsTargets } from "@/services/apis/gen/queries";
import {
  CloudCheckIcon,
  ExternalLink,
  FileText,
  Loader2,
  Search as SearchIcon,
  TargetIcon,
} from "lucide-react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Search() {
  const [param] = useSearchParams();
  const [page, setPage] = React.useState(1);
  const { selectedWorkspace } = useWorkspaceSelector();
  const navigate = useNavigate();

  const searchQuery = param.get("query") as string;

  const { data, isFetching } = useSearchControllerSearchAssetsTargets({
    value: searchQuery,
    workspaceId: selectedWorkspace as string,
    page: page,
    isSaveHistory: true,
  });

  if (isFetching) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p>Searching...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-2">
          <SearchIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold">Search Results</h1>
        </div>
        <div className="flex gap-2 ">
          <span>Query:</span>
          <span className="font-bold">{searchQuery}</span>
          <span>•</span>
          <span>{data?.total || 0} results found</span>
        </div>
      </div>

      {data && data.total === 0 && (
        <div className="rounded-lg shadow-sm border p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No results found</h3>
          <p>Try adjusting your search query or browse other sections</p>
        </div>
      )}

      {data && data.data.targets.length > 0 && (
        <div className="rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <TargetIcon className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-medium">
                Targets ({data.data.targets.length})
              </h2>
            </div>
          </div>
          <div className="divide-y">
            {data.data.targets.map((target, index) => (
              <div
                key={target.id || index}
                onClick={() => navigate("/targets/" + target.id)}
                className="px-6 py-4 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium group-hover:text-blue-600">
                      {target.value}
                    </p>
                  </div>
                  <ExternalLink className="size-4 group-hover:text-blue-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.data.assets.length > 0 && (
        <div className="rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <CloudCheckIcon className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-medium">
                Assets ({data.data.assets.length})
              </h2>
            </div>
          </div>
          <div className="divide-y">
            {data.data.assets.map((asset, index) => (
              <div
                key={asset.id || index}
                onClick={() => {
                  navigate("assets/" + asset.id);
                }}
                className="px-6 py-4 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium group-hover:text-blue-600">
                      {asset.value}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm group-hover:text-blue-600">
                      View details
                    </span>
                    <ExternalLink className="size-4 group-hover:text-blue-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            pageCount={data.pageCount}
            setPage={setPage}
          />
        </div>
      )}
    </div>
  );
}

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
