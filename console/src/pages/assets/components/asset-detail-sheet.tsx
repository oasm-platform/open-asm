import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AssetDetail from './asset-detail';

dayjs.extend(relativeTime);

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  id: string;
}

export default function AssetDetailSheet({ open, setOpen, id }: Props) {
  const navigate = useNavigate();

  const handleViewDetail = () => {
    setOpen(false);
    navigate(`/assets/${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          'flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
          'shadow-xl p-5',
          'inset-y-0 right-0 fixed',
        )}
      >
        <SheetTitle className="sr-only">Asset Detail</SheetTitle>
        <SheetDescription className="sr-only">Description</SheetDescription>
        <AssetDetail id={id} />

        {/* Footer with View Full Page button */}
        <div className="pt-4 border-t mt-auto">
          <Button
            variant="default"
            onClick={handleViewDetail}
            className="w-full flex items-center justify-center gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            View Full Page
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
