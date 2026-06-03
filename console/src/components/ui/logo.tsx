interface LogoProps {
  width?: number;
  height?: number;
  logoPath?: string;
}
export default function Logo({ width = 16, height = 16, logoPath }: LogoProps) {
  return (
    <>
      {logoPath ? (
        <img src={logoPath} alt="logo" className="w-13 rounded-md" />
      ) : (
        <img src="/logo.png" alt="logo" className="w-7 h-7 rounded-md" />
      )}
    </>
  );
}
