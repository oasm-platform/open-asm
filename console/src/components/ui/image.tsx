import { ImageIcon } from 'lucide-react';
import React from 'react';

interface ImageProps {
  url?: string | null | undefined;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Image: React.FC<ImageProps> = ({
  url,
  width,
  height,
  className,
}) => {
  if (!url) return <ImageIcon width={width} height={height} className={className} />;

  const isHttpUrl = url.startsWith('http://') || url.startsWith('https://');
  const imageUrl = isHttpUrl ? url : `/api${url}`;

  return (
    <img
      src={imageUrl}
      width={width}
      height={height}
      alt=""
      style={{
        width: width,
        height: height,
        objectFit: 'cover',
      }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
      className={className}
    />
  );
};

export default Image;
