import { Radar } from 'lucide-react';

interface LogoProps {
    width?: number;
    height?: number;
}
export default function Logo({ width = 16, height = 16 }: LogoProps) {
    return (
        <Radar height={height} width={width} />
    )
}