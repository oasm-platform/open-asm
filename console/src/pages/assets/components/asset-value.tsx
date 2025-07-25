export default function AssetValue({ httpx, value }) {
  return httpx?.failed ? (
    <span className="text-gray-500 font-bold line-through">{value}</span>
  ) : (
    <a target="_blank" href={httpx?.url}>
      <span className="font-bold">{value}</span>
    </a>
  );
}
