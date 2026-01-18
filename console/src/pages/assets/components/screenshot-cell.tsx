import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GetAssetsResponseDto } from '@/services/apis/gen/queries';
import React from 'react';

interface ScreenshotCellProps {
  asset: GetAssetsResponseDto;
}

const ScreenshotCell: React.FC<ScreenshotCellProps> = ({ asset }) => {
  if (!asset.screenshotPath) {
    return (
      <div className="w-50 h-30 border-dashed border-2 rounded-lg flex items-center justify-center">
        <span className="text-gray-500 text-sm">No screenshot</span>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-50 h-[112.5px] relative overflow-hidden rounded-lg">
          {' '}
          {/* 16:9 ratio: 200x112.5 */}
          <img
            className="w-full h-full object-cover cursor-pointer transition-transform duration-200 hover:scale-105"
            src={asset.screenshotPath}
            alt="Asset screenshot"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent
        className="p-2 m-2 w-fit h-fit border-0 bg-transparent shadow-none"
        side="right"
        align="start"
      >
        <div className="w-160  rounded-lg overflow-hidden">
          <img
            src={asset.screenshotPath}
            alt="Zoomed asset screenshot"
            className="w-full h-full object-contain"
          />
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default ScreenshotCell;
