import StatusCode from "@/components/ui/status-code";
import { MoveRight } from "lucide-react";

export default function HTTPXStatusCode({ httpx }) {
  return httpx?.chain_status_codes ? (
    <div className="flex items-center gap-1">
      <StatusCode code={httpx?.chain_status_codes[0].toString()} />
      <MoveRight size={15} />
      <StatusCode
        code={httpx?.chain_status_codes[
          httpx.chain_status_codes.length - 1
        ].toString()}
      />
    </div>
  ) : (
    <StatusCode code={httpx?.status_code} />
  );
}
