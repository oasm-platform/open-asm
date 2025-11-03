import React from 'react';

interface ImageProps {
    url: string;
    width?: string | number;
    height?: string | number;
}

export const Image: React.FC<ImageProps> = ({ url, width, height }) => {
    // Check if URL is a complete HTTP URL
    const isHttpUrl = url.startsWith('http://') || url.startsWith('https://');

    // If not a complete URL, prepend with API storage path
    const imageUrl = isHttpUrl ? url : `${import.meta.env.VITE_API_URL}/api/storage/${url}`;

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
        />
    );
};

export default Image;
