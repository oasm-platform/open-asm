import type { HttpResponse } from "@/services/apis/gen/queries";

export default function AssetValue({
  httpResponse,
  value,
}: {
  httpResponse: HttpResponse | undefined;
  value: string;
}) {
  return httpResponse?.failed ? (
    <span className="text-gray-500 font-bold line-through">{value}</span>
  ) : (
    <a target="_blank" href={httpResponse?.url}>
      <span className="font-bold">{value}</span>
    </a>
  );
}
