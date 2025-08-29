import StatusCode from '@/components/ui/status-code';
import type { HttpResponse } from '@/services/apis/gen/queries';
import { MoveRight } from 'lucide-react';

export default function HTTPXStatusCode({
  httpResponse,
}: {
  httpResponse: HttpResponse | undefined;
}) {
  return httpResponse?.chain_status_codes ? (
    <div className="flex items-center gap-1">
      <StatusCode code={httpResponse?.chain_status_codes[0].toString()} />
      <MoveRight size={15} />
      <StatusCode
        code={httpResponse?.chain_status_codes[
          httpResponse.chain_status_codes.length - 1
        ].toString()}
      />
    </div>
  ) : (
    <StatusCode code={httpResponse?.status_code.toString()} />
  );
}
