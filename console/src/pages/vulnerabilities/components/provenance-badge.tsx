import { useT } from '@/lib/i18n-dictionary';
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
  const t = useT();
  if (provenance === VulnerabilityProvenance.new) {
    return <Badge variant="soft">{t('vulnerabilities.provenance.new')}</Badge>;
  }
  if (provenance === VulnerabilityProvenance.not_seen) {
    return (
      <Badge
        variant="outline"
        className="border-dashed"
        title={t('vulnerabilities.provenance.notSeenTitle')}
      >
        {t('vulnerabilities.provenance.notSeen')}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t('vulnerabilities.provenance.recurring', { n: timesSeen })}</Badge>;
});
