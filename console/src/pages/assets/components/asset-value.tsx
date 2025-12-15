import type { HttpResponseDTO } from '@/services/apis/gen/queries';

export default function AssetValue({
  httpResponse,
  value,
}: {
  httpResponse: HttpResponseDTO | undefined;
  value: string;
}) {
  return httpResponse?.failed ? (
    <span className="text-gray-500 font-bold line-through">{value}</span>
  ) : (
    <a
      target="_blank"
      href={httpResponse?.url}
      className="inline-flex items-center gap-1 hover:text-blue-500 rounded transition-colors duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {httpResponse?.favicon_url && (
        <img
          src={httpResponse?.favicon_url}
          className="rounded-full w-5 h-5"
          alt="favicon"
        />
      )}
      <pre className="break-all whitespace-pre-wrap">{value}</pre>
    </a>
  );
}
