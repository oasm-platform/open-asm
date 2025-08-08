import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import AssetDetail from "./components/asset-detail";

dayjs.extend(relativeTime);

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  id: string;
}

export default function AssetDetailSheet({ open, setOpen, id }: Props) {
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          "flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl",
          "shadow-xl p-5",
          "inset-y-0 right-0 fixed",
        )}
      >
        <AssetDetail id={id} />
      </SheetContent>
    </Sheet>
  );
}
