import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function FilterForm() {
  return (
    <div className="relative w-1/4">
      <Input placeholder="Filter value" />
      <Search className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
    </div>
  );
}
