export default function AssetValue({ http_scraper, value }: { http_scraper: any; value: string }) {
  return http_scraper?.failed ? (
    <span className="text-gray-500 font-bold line-through">{value}</span>
  ) : (
    <a target="_blank" href={http_scraper?.url}>
      <span className="font-bold">{value}</span>
    </a>
  );
}
