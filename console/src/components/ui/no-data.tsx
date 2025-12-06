export default function NoData({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="text-gray-500">{message}</div>
    </div>
  );
}
