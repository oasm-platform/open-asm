import React from 'react';

interface ImageProps {
    url?: string | null | undefined;
    width?: string | number;
    height?: string | number;
    className?: string;
}

export const Image: React.FC<ImageProps> = ({ url, width, height, className }) => {
    // Check if URL is a complete HTTP URL
    const isHttpUrl = url?.startsWith('http://') || url?.startsWith('https://');

    // If not a complete URL, prepend with API storage path
    const imageUrl = isHttpUrl ? url : `${import.meta.env.VITE_API_URL}/api${url}`;
    if (!imageUrl) return <></>
    return (
        <img
            src={imageUrl}
            width={width}
            height={height}
            alt=""
            style={{
                width: width,
                height: height,
                objectFit: 'cover'
            }}
            onError={() => {
                console.error('Failed to load image:', imageUrl);
            }}
            className={className}
        />
    );
};

export default Image;
