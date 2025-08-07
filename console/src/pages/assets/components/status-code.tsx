import StatusCode from "@/components/ui/status-code";
import { MoveRight } from "lucide-react";

export default function HTTPXStatusCode({ http_probe }: { http_probe: any }) {
  return http_probe?.chain_status_codes ? (
    <div className="flex items-center gap-1">
      <StatusCode code={http_probe?.chain_status_codes[0].toString()} />
      <MoveRight size={15} />
      <StatusCode
        code={http_probe?.chain_status_codes[
          http_probe.chain_status_codes.length - 1
        ].toString()}
      />
    </div>
  ) : (
    <StatusCode code={http_probe?.status_code} />
  );
}
