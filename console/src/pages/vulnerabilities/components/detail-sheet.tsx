import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useVulnerabilitiesControllerGetVulnerabilityById } from '@/services/apis/gen/queries';

interface DetailSheetProps {
  vulId: string;
  open: boolean;
  setOpen: (value: boolean) => void;
}

export default function DetailSheet({
  vulId,
  open,
  setOpen,
}: DetailSheetProps) {
  const { data } = useVulnerabilitiesControllerGetVulnerabilityById(vulId);
  if (!data) {
    return null;
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          'flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
          'shadow-xl p-5',
          'inset-y-0 right-0 fixed',
        )}
      >
        <SheetTitle className="sr-only">Vulnerability Detail</SheetTitle>
        <SheetDescription className="sr-only">Description</SheetDescription>
        <div>{data.id}</div>
      </SheetContent>
    </Sheet>
  );
}
