import { QueryDocument } from './builtin/query/QueryDocument';
import { SummaryDocument } from './builtin/summary/SummaryDocument';
import { VulnerabilityDocument } from './builtin/vulnerability/VulnerabilityDocument';

// Documents only for now; full templates (queries + toData) replace this as `BUILTIN_TEMPLATES`.
export const BUILTIN_DOCUMENTS = {
  summary: { Document: SummaryDocument },
  vulnerability: { Document: VulnerabilityDocument },
  query: { Document: QueryDocument },
};
