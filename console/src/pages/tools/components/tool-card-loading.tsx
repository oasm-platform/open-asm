interface ToolCardSkeletonProps {
  count?: number;
}

const ToolCardSkeleton = ({ count = 8 }: ToolCardSkeletonProps) => {
  const skeletonCards = Array.from({ length: count }, (_, index) => (
    <div
      key={index}
      className="flex flex-col items-start gap-2 rounded-lg border p-5 animate-pulse"
    >
      <div className="flex items-center gap-2">
        <div className="size-6 rounded bg-muted" />
        <div className="h-4 w-24 rounded-md bg-muted" />
        <div className="h-4 w-16 rounded-full bg-muted" />
      </div>
      <div className="h-3 w-full rounded-md bg-muted" />
      <div className="h-3 w-11/12 rounded-md bg-muted" />
    </div>
  ));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {skeletonCards}
    </div>
  );
};

export default ToolCardSkeleton;