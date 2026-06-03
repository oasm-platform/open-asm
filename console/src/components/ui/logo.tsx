interface LogoProps {
  width?: number;
  height?: number;
  logoPath?: string;
}
export default function Logo({ width, height, logoPath }: LogoProps) {
  return (
    <>
      {logoPath ? (
        <img src={logoPath} alt="logo" width={width} height={height} className="rounded-md" />
      ) : (
        <img src="/logo.png" alt="logo" width={width} height={height} className="rounded-md" />
      )}
    </>
  );
}
