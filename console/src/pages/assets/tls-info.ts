// The regenerated API client types `httpResponses.tls` as an open record; narrow the fields the UI reads.
export type AssetTls = {
  host?: string;
  port?: string;
  not_before?: string;
  not_after: string;
  subject_cn?: string;
  issuer_org: string[];
  subject_an?: string[];
};
