/**
 * Shape of the httpx `tls` block the asset pages render.
 *
 * The API types `httpResponses.tls` as an untyped record since the
 * http-response split (#684) — it is an ingest-only compat field there. This
 * local type keeps the pages' previous typing so a regenerated API client
 * does not break the build; it changes no runtime behaviour.
 */
export interface TlsInfo {
  host: string;
  port: string;
  probe_status: boolean;
  tls_version: string;
  cipher: string;
  not_before: string;
  not_after: string;
  subject_dn: string;
  subject_cn: string;
  subject_an: string[];
  serial: string;
  issuer_dn: string;
  issuer_cn: string;
  issuer_org: string[];
  fingerprint_hash: Record<string, unknown>;
  wildcard_certificate: boolean;
  tls_connection: string;
  sni: string;
}

export function asTlsInfo(tls: unknown): TlsInfo | undefined {
  return (tls ?? undefined) as TlsInfo | undefined;
}
