export default function AssetValue({ http_probe, value }: { http_probe: any; value: string }) {
  return http_probe?.failed ? (
    <span className="text-gray-500 font-bold line-through">{value}</span>
  ) : (
    <a target="_blank" href={http_probe?.url}>
      <span className="font-bold">{value}</span>
    </a>
  );
}
