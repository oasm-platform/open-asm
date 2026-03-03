import { JoinColumn, ManyToOne, ViewColumn, ViewEntity } from 'typeorm';
import { AssetService } from './asset-services.entity';

/**
 * A view entity that flattens TLS JSONB data from http_responses into
 * individual columns for efficient querying and pagination.
 * The view deduplicates by tls->>'host', keeping only the latest entry
 * per host+assetService pair.
 */
@ViewEntity({
  name: 'tls_assets_view',
  expression: `
    SELECT DISTINCT ON (hr.tls->>'host', hr."assetServiceId")
      hr."assetServiceId",
      hr.tls->>'host'           AS host,
      hr.tls->>'sni'            AS sni,
      hr.tls->>'subject_dn'     AS subject_dn,
      hr.tls->>'subject_cn'     AS subject_cn,
      hr.tls->>'issuer_dn'      AS issuer_dn,
      hr.tls->>'not_before'     AS not_before,
      hr.tls->>'not_after'      AS not_after,
      hr.tls->>'tls_version'    AS tls_version,
      hr.tls->>'cipher'         AS cipher,
      hr.tls->>'tls_connection' AS tls_connection,
      (hr.tls->'subject_an')::text AS subject_an
    FROM http_responses hr
    WHERE hr.tls IS NOT NULL
    ORDER BY hr.tls->>'host', hr."assetServiceId", hr."createdAt" DESC
  `,
})
export class TlsAssetsView {
  @ViewColumn()
  assetServiceId: string;

  @ViewColumn()
  host: string;

  @ViewColumn()
  sni: string;

  @ViewColumn()
  subject_dn: string;

  @ViewColumn()
  subject_cn: string;

  @ViewColumn()
  issuer_dn: string;

  @ViewColumn()
  not_before: string;

  @ViewColumn()
  not_after: string;

  @ViewColumn()
  tls_version: string;

  @ViewColumn()
  cipher: string;

  @ViewColumn()
  tls_connection: string;

  /** Stored as JSON text, parsed on read */
  @ViewColumn()
  subject_an: string;

  @ManyToOne(() => AssetService, (assetService) => assetService.tlsAssets)
  @JoinColumn({ name: 'assetServiceId' })
  assetService: AssetService;
}
