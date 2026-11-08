import { Badge } from '@/components/ui/badge';
import { VulnerabilityProvenance } from '@/services/apis/gen/queries';
import { memo } from 'react';

/** How a project saw a finding: new / recurring ×n / not seen again. */
export const ProvenanceBadge = memo(function ProvenanceBadge({
  provenance,
  timesSeen,
}: {
  provenance: VulnerabilityProvenance;
  timesSeen: number;
}) {
  if (provenance === VulnerabilityProvenance.new) {
    return <Badge variant="soft">New</Badge>;
  }
  if (provenance === VulnerabilityProvenance.not_seen) {
    return (
      <Badge
        variant="outline"
        className="border-dashed"
        title="A later scan of this asset with the same tool did not report it: possibly fixed"
      >
        Not seen again
      </Badge>
    );
  }
  return <Badge variant="secondary">Recurring ×{timesSeen}</Badge>;
});
