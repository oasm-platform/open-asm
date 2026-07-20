import type { GetAssetsResponseDto } from '@/services/apis/gen/queries';
import { X } from 'lucide-react';
import React, { useCallback, useEffect } from 'react';

interface ScreenshotCellProps {
  asset: GetAssetsResponseDto;
}

const ScreenshotCell: React.FC<ScreenshotCellProps> = ({ asset }) => {
  const [open, setOpen] = React.useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!asset.screenshotPath) {
    return (
      <div className="w-50 h-30 border-dashed border-2 rounded-lg flex items-center justify-center">
        <span className="text-gray-500 text-sm">No screenshot</span>
      </div>
    );
  }

  return (
    <>
      <div className="w-50 h-[112.5px] relative overflow-hidden rounded-lg">
        <img
          className="w-full h-full object-cover cursor-pointer transition-transform duration-200 hover:scale-105"
          src={asset.screenshotPath as unknown as string}
          alt="Asset screenshot"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => { e.stopPropagation(); close(); }}
        >
          <button
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            onClick={(e) => { e.stopPropagation(); close(); }}
            aria-label="Close screenshot"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            src={asset.screenshotPath as unknown as string}
            alt="Asset screenshot full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default ScreenshotCell;
