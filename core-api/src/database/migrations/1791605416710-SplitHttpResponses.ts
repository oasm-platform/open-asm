import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Split http_responses blob columns into 5 queryable facet tables + drop the
 * 3 legacy views. Single-file migration (no dual-write release).
 *
 * up():   swap http_responses(assetServiceId) for (assetServiceId,
 *         createdAt) → CREATE 5 tables → FKs (NOT VALID) → BACKFILL →
 *         VALIDATE → DROP 3 views (+ typeorm_metadata) → DROP 5 blob columns.
 * down(): restore columns → copy-back (best-effort) → restore 3 views +
 *         metadata + tech GIN index → drop FKs + 5 tables.
 */
const VIEW_EXPRESSIONS: Record<string, string> = {
    ip_assets_view: `SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`,
    status_code_asset_services_view: `SELECT http_responses.status_code AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses
        UNION
        SELECT UNNEST(chain_status_codes)::INT AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses`,
    tls_assets_view: `SELECT DISTINCT ON (hr.tls->>'host', hr."assetServiceId")
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
    ORDER BY hr.tls->>'host', hr."assetServiceId", hr."createdAt" DESC`,
};

export class SplitHttpResponses1791605416710 implements MigrationInterface {
    name = 'SplitHttpResponses1791605416710'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Drop the junk GIN index on tech (column goes away below) ──
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_cc7d157cf5de83c706e4b93c4f"`);
        // Latest-response-per-service lookups; supersedes the single-column
        // assetServiceId index (same prefix).
        await queryRunner.query(`CREATE INDEX "IDX_http_responses_assetServiceId_createdAt" ON "http_responses" ("assetServiceId", "createdAt") `);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_27118f1a1f2a0b32462665b591"`);

        // ── 2. CREATE the 5 facet tables ─────────────────────────────────
        await queryRunner.query(`CREATE TABLE "http_response_technologies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "httpResponseId" uuid NOT NULL, "assetServiceId" uuid, "name" character varying NOT NULL, "version" character varying, CONSTRAINT "UQ_41a52e7b86eddc6dafdfe464d66" UNIQUE NULLS NOT DISTINCT ("httpResponseId", "name", "version"), CONSTRAINT "PK_d80d8a3434e0bfa8bf6dec0b23f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_http_response_technologies_name" ON "http_response_technologies" ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_http_response_technologies_assetServiceId" ON "http_response_technologies" ("assetServiceId") `);
        await queryRunner.query(`CREATE TABLE "http_status_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "httpResponseId" uuid NOT NULL, "assetServiceId" uuid, "statusCode" integer NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "chainIndex" integer, CONSTRAINT "PK_1020bffa295a2b726df1cdae6f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_http_status_codes_assetServiceId" ON "http_status_codes" ("assetServiceId", "statusCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_http_status_codes_httpResponseId" ON "http_status_codes" ("httpResponseId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_http_status_codes_chain" ON "http_status_codes" ("httpResponseId", "chainIndex") WHERE NOT "isPrimary"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_http_status_codes_primary" ON "http_status_codes" ("httpResponseId") WHERE "isPrimary"`);
        await queryRunner.query(`CREATE TABLE "ip_observations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "httpResponseId" uuid, "assetServiceId" uuid, "assetId" uuid, "ip" inet NOT NULL, "source" character varying NOT NULL, "jobHistoryId" character varying, CONSTRAINT "PK_3bbaba66ad7474c9bd8236ed3e9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ip_observations_assetServiceId" ON "ip_observations" ("assetServiceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ip_observations_ip" ON "ip_observations" ("ip") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ip_observations_asset" ON "ip_observations" ("assetId", "ip", "source") WHERE "assetId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ip_observations_http" ON "ip_observations" ("httpResponseId", "ip", "source") WHERE "httpResponseId" IS NOT NULL`);
        await queryRunner.query(`CREATE TABLE "tls_certificates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "httpResponseId" uuid NOT NULL, "assetServiceId" uuid, "jobHistoryId" character varying, "host" character varying, "port" character varying, "probeStatus" boolean NOT NULL DEFAULT false, "tlsVersion" character varying, "cipher" character varying, "notBefore" TIMESTAMP WITH TIME ZONE, "notAfter" TIMESTAMP WITH TIME ZONE, "subjectDn" text, "subjectCn" character varying, "subjectAn" jsonb, "serial" character varying, "issuerDn" text, "issuerCn" character varying, "issuerOrg" jsonb, "fingerprintMd5" character varying, "fingerprintSha1" character varying, "fingerprintSha256" character varying, "wildcardCertificate" boolean NOT NULL DEFAULT false, "tlsConnection" character varying, "sni" character varying, CONSTRAINT "UQ_cce0ba7d9416b9e25af0d66ff77" UNIQUE ("httpResponseId"), CONSTRAINT "PK_3d1e7fd02c28569eeaaa19dd2fc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_tls_certificates_host" ON "tls_certificates" ("host") `);
        await queryRunner.query(`CREATE INDEX "IDX_tls_certificates_assetServiceId" ON "tls_certificates" ("assetServiceId") `);
        await queryRunner.query(`CREATE TABLE "dns_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assetId" uuid NOT NULL, "recordType" character varying NOT NULL, "value" text NOT NULL, "jobHistoryId" uuid, CONSTRAINT "UQ_620edcf2266cbbd7b8c378d6474" UNIQUE ("assetId", "recordType", "value"), CONSTRAINT "PK_b9d97eeaf996c468b2468839c05" PRIMARY KEY ("id"))`);

        // ── 3. FKs (NOT VALID first — validated after backfill) ──────────
        await queryRunner.query(`ALTER TABLE "http_response_technologies" ADD CONSTRAINT "FK_2a4f83acc56355c0f8f89e5e6dd" FOREIGN KEY ("httpResponseId") REFERENCES "http_responses"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "http_response_technologies" ADD CONSTRAINT "FK_0196c5bcb03a029d41655498f90" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" ADD CONSTRAINT "FK_c8e0ef6905c388b86cebc59ca54" FOREIGN KEY ("httpResponseId") REFERENCES "http_responses"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" ADD CONSTRAINT "FK_42a28d7af8a26d434a0705314d8" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "ip_observations" ADD CONSTRAINT "FK_1c9f3a944e5d6ad5ca0da9b6711" FOREIGN KEY ("httpResponseId") REFERENCES "http_responses"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "ip_observations" ADD CONSTRAINT "FK_fe448bf65e89664023e25f6bf82" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "ip_observations" ADD CONSTRAINT "FK_35f21ddc046cbabe41a970b7356" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" ADD CONSTRAINT "FK_cce0ba7d9416b9e25af0d66ff77" FOREIGN KEY ("httpResponseId") REFERENCES "http_responses"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" ADD CONSTRAINT "FK_bd62f1f9efac18e986b3051e098" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);
        await queryRunner.query(`ALTER TABLE "dns_records" ADD CONSTRAINT "FK_d4ca3f09c0968f25a8028e60b1f" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`);

        // ── 4. BACKFILL (defensive casts — dirty scanner data → NULL) ────
        await queryRunner.query(`INSERT INTO "tls_certificates" ("httpResponseId","assetServiceId","host","port","probeStatus","tlsVersion","cipher","notBefore","notAfter","subjectDn","subjectCn","subjectAn","serial","issuerDn","issuerCn","issuerOrg","fingerprintMd5","fingerprintSha1","fingerprintSha256","wildcardCertificate","tlsConnection","sni")
            SELECT hr.id, hr."assetServiceId"::uuid,
              hr.tls->>'host', hr.tls->>'port',
              COALESCE(NULLIF(hr.tls->>'probe_status','')::boolean, false),
              hr.tls->>'tls_version', hr.tls->>'cipher',
              CASE
                WHEN hr.tls->>'not_before' ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}' THEN replace(left(hr.tls->>'not_before',19),' ','T')::timestamp AT TIME ZONE 'UTC'
                WHEN hr.tls->>'not_before' ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}' THEN (replace(left(hr.tls->>'not_before',16),' ','T') || ':00')::timestamp AT TIME ZONE 'UTC'
                WHEN hr.tls->>'not_before' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (hr.tls->>'not_before')::timestamp AT TIME ZONE 'UTC'
                ELSE NULL END,
              CASE
                WHEN hr.tls->>'not_after' ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}' THEN replace(left(hr.tls->>'not_after',19),' ','T')::timestamp AT TIME ZONE 'UTC'
                WHEN hr.tls->>'not_after' ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}' THEN (replace(left(hr.tls->>'not_after',16),' ','T') || ':00')::timestamp AT TIME ZONE 'UTC'
                WHEN hr.tls->>'not_after' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (hr.tls->>'not_after')::timestamp AT TIME ZONE 'UTC'
                ELSE NULL END,
              hr.tls->>'subject_dn', hr.tls->>'subject_cn', hr.tls->'subject_an', hr.tls->>'serial',
              hr.tls->>'issuer_dn', hr.tls->>'issuer_cn', hr.tls->'issuer_org',
              hr.tls->'fingerprint_hash'->>'md5', hr.tls->'fingerprint_hash'->>'sha1', hr.tls->'fingerprint_hash'->>'sha256',
              COALESCE(NULLIF(hr.tls->>'wildcard_certificate','')::boolean, false),
              hr.tls->>'tls_connection', hr.tls->>'sni'
            FROM http_responses hr WHERE hr.tls IS NOT NULL ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "http_response_technologies" ("httpResponseId","assetServiceId","name","version")
            SELECT hr.id, hr."assetServiceId"::uuid, split_part(t.tech, ':', 1),
              CASE WHEN position(':' in t.tech) > 0 THEN nullif(substring(t.tech from position(':' in t.tech)+1),'') ELSE NULL END
            FROM http_responses hr CROSS JOIN LATERAL unnest(hr.tech) AS t(tech)
            WHERE hr.tech IS NOT NULL AND t.tech IS NOT NULL AND t.tech <> '' ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "ip_observations" ("httpResponseId","assetServiceId","ip","source")
            SELECT hr.id, hr."assetServiceId"::uuid, x.ip::inet, 'httpx_a'
            FROM http_responses hr CROSS JOIN LATERAL unnest(hr.a) AS x(ip)
            WHERE hr.a IS NOT NULL AND x.ip ~ '^([0-9]{1,3}\\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]*:[0-9a-fA-F:]+$' AND pg_input_is_valid(x.ip, 'inet') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "ip_observations" ("httpResponseId","assetServiceId","ip","source")
            SELECT hr.id, hr."assetServiceId"::uuid, x.ip::inet, 'resolver'
            FROM http_responses hr CROSS JOIN LATERAL unnest(hr.resolvers) AS x(ip)
            WHERE hr.resolvers IS NOT NULL AND x.ip ~ '^([0-9]{1,3}\\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]*:[0-9a-fA-F:]+$' AND pg_input_is_valid(x.ip, 'inet') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "ip_observations" ("assetId","ip","source")
            SELECT a.id, e::inet, 'dns_a' FROM assets a
            CROSS JOIN LATERAL jsonb_array_elements_text((a."dnsRecords"::jsonb)->'A') e
            WHERE a."dnsRecords" IS NOT NULL AND e ~ '^([0-9]{1,3}\\.){3}[0-9]{1,3}$' AND pg_input_is_valid(e, 'inet') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "ip_observations" ("assetId","ip","source")
            SELECT a.id, e::inet, 'dns_aaaa' FROM assets a
            CROSS JOIN LATERAL jsonb_array_elements_text((a."dnsRecords"::jsonb)->'AAAA') e
            WHERE a."dnsRecords" IS NOT NULL AND e ~ '^[0-9a-fA-F:]*:[0-9a-fA-F:]+$' AND pg_input_is_valid(e, 'inet') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "http_status_codes" ("httpResponseId","assetServiceId","statusCode","isPrimary","chainIndex")
            SELECT hr.id, hr."assetServiceId"::uuid, hr.status_code, true, NULL FROM http_responses hr
            WHERE hr.status_code IS NOT NULL ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "http_status_codes" ("httpResponseId","assetServiceId","statusCode","isPrimary","chainIndex")
            SELECT hr.id, hr."assetServiceId"::uuid, nullif(c.code,'')::integer, false, (c.ord - 1)
            FROM http_responses hr CROSS JOIN LATERAL unnest(hr.chain_status_codes) WITH ORDINALITY AS c(code, ord)
            WHERE hr.chain_status_codes IS NOT NULL AND c.code ~ '^\\d+$' ON CONFLICT DO NOTHING`);
        await queryRunner.query(`INSERT INTO "dns_records" ("assetId","recordType","value")
            SELECT a.id, upper(kv.key), e FROM assets a
            CROSS JOIN LATERAL jsonb_each_text(a."dnsRecords"::jsonb) AS kv(key, val)
            CROSS JOIN LATERAL jsonb_array_elements_text(kv.val::jsonb) AS e
            WHERE a."dnsRecords" IS NOT NULL
              AND jsonb_typeof(a."dnsRecords"::jsonb) = 'object'
              AND jsonb_typeof(kv.val::jsonb) = 'array'
              AND e IS NOT NULL AND e <> '' ON CONFLICT DO NOTHING`);

        // ── 5. Validate FKs ──────────────────────────────────────────────
        await queryRunner.query(`ALTER TABLE "http_response_technologies" VALIDATE CONSTRAINT "FK_2a4f83acc56355c0f8f89e5e6dd"`);
        await queryRunner.query(`ALTER TABLE "http_response_technologies" VALIDATE CONSTRAINT "FK_0196c5bcb03a029d41655498f90"`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" VALIDATE CONSTRAINT "FK_c8e0ef6905c388b86cebc59ca54"`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" VALIDATE CONSTRAINT "FK_42a28d7af8a26d434a0705314d8"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" VALIDATE CONSTRAINT "FK_1c9f3a944e5d6ad5ca0da9b6711"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" VALIDATE CONSTRAINT "FK_fe448bf65e89664023e25f6bf82"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" VALIDATE CONSTRAINT "FK_35f21ddc046cbabe41a970b7356"`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" VALIDATE CONSTRAINT "FK_cce0ba7d9416b9e25af0d66ff77"`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" VALIDATE CONSTRAINT "FK_bd62f1f9efac18e986b3051e098"`);
        await queryRunner.query(`ALTER TABLE "dns_records" VALIDATE CONSTRAINT "FK_d4ca3f09c0968f25a8028e60b1f"`);

        // ── 6. Drop the 3 legacy views (+ metadata) ──────────────────────
        // typeorm_metadata may not exist on a fresh DB (created lazily by
        // TypeORM), so only clean it when present — a failed DELETE would
        // abort the surrounding transaction on Postgres.
        const metadataExists = await queryRunner.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'typeorm_metadata'`,
        );
        if (metadataExists?.length) {
          await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = 'VIEW' AND "schema" = 'public' AND "name" IN ('tls_assets_view','status_code_asset_services_view','ip_assets_view')`);
        }
        await queryRunner.query(`DROP VIEW IF EXISTS "tls_assets_view"`);
        await queryRunner.query(`DROP VIEW IF EXISTS "status_code_asset_services_view"`);
        await queryRunner.query(`DROP VIEW IF EXISTS "ip_assets_view"`);

        // ── 7. Drop the 5 old blob columns ───────────────────────────────
        await queryRunner.query(`ALTER TABLE "http_responses" DROP COLUMN "tls"`);
        await queryRunner.query(`ALTER TABLE "http_responses" DROP COLUMN "a"`);
        await queryRunner.query(`ALTER TABLE "http_responses" DROP COLUMN "tech"`);
        await queryRunner.query(`ALTER TABLE "http_responses" DROP COLUMN "resolvers"`);
        await queryRunner.query(`ALTER TABLE "http_responses" DROP COLUMN "chain_status_codes"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Restore the 5 blob columns ─────────────────────────────────
        await queryRunner.query(`ALTER TABLE "http_responses" ADD "chain_status_codes" character varying array`);
        await queryRunner.query(`ALTER TABLE "http_responses" ADD "resolvers" character varying array`);
        await queryRunner.query(`ALTER TABLE "http_responses" ADD "tech" character varying array`);
        await queryRunner.query(`ALTER TABLE "http_responses" ADD "a" character varying array`);
        await queryRunner.query(`ALTER TABLE "http_responses" ADD "tls" jsonb`);

        // ── 2. Copy-back (best-effort, not byte-exact) ───────────────────
        await queryRunner.query(`UPDATE http_responses hr SET "tls" = jsonb_build_object(
            'host', tc."host", 'port', tc."port", 'probe_status', tc."probeStatus",
            'tls_version', tc."tlsVersion", 'cipher', tc."cipher",
            'not_before', to_char(tc."notBefore",'YYYY-MM-DD HH24:MI:SS'),
            'not_after', to_char(tc."notAfter", 'YYYY-MM-DD HH24:MI:SS'),
            'subject_dn', tc."subjectDn", 'subject_cn', tc."subjectCn", 'subject_an', tc."subjectAn",
            'serial', tc."serial", 'issuer_dn', tc."issuerDn", 'issuer_cn', tc."issuerCn",
            'issuer_org', tc."issuerOrg",
            'fingerprint_hash', jsonb_build_object('md5', tc."fingerprintMd5",'sha1', tc."fingerprintSha1",'sha256', tc."fingerprintSha256"),
            'wildcard_certificate', tc."wildcardCertificate", 'tls_connection', tc."tlsConnection", 'sni', tc."sni")
          FROM tls_certificates tc WHERE tc."httpResponseId" = hr.id`);
        await queryRunner.query(`UPDATE http_responses hr SET "tech" = sub.arr FROM (
            SELECT "httpResponseId", array_agg(name || CASE WHEN version IS NULL THEN '' ELSE ':'||version END) AS arr
            FROM http_response_technologies GROUP BY "httpResponseId") sub
          WHERE sub."httpResponseId" = hr.id`);
        await queryRunner.query(`UPDATE http_responses hr SET "a" = sub.arr FROM (
            SELECT "httpResponseId", array_agg(host(ip)) AS arr FROM ip_observations
            WHERE source='httpx_a' GROUP BY "httpResponseId") sub WHERE sub."httpResponseId" = hr.id`);
        await queryRunner.query(`UPDATE http_responses hr SET "resolvers" = sub.arr FROM (
            SELECT "httpResponseId", array_agg(host(ip)) AS arr FROM ip_observations
            WHERE source='resolver' GROUP BY "httpResponseId") sub WHERE sub."httpResponseId" = hr.id`);
        await queryRunner.query(`UPDATE http_responses hr SET "chain_status_codes" = sub.arr FROM (
            SELECT "httpResponseId", array_agg("statusCode"::text ORDER BY "chainIndex") AS arr
            FROM http_status_codes WHERE NOT "isPrimary" GROUP BY "httpResponseId") sub
          WHERE sub."httpResponseId" = hr.id`);

        // ── 3. Restore the 3 legacy views + metadata + tech GIN index ───
        await queryRunner.query(`CREATE VIEW "ip_assets_view" AS ${VIEW_EXPRESSIONS.ip_assets_view}`);
        await queryRunner.query(`CREATE VIEW "status_code_asset_services_view" AS ${VIEW_EXPRESSIONS.status_code_asset_services_view}`);
        await queryRunner.query(`CREATE VIEW "tls_assets_view" AS ${VIEW_EXPRESSIONS.tls_assets_view}`);
        for (const name of Object.keys(VIEW_EXPRESSIONS)) {
            await queryRunner.query(
                `INSERT INTO "typeorm_metadata" ("type", "database", "schema", "table", "name", "value") VALUES ('VIEW', current_database(), 'public', $1, $1, $2) ON CONFLICT DO NOTHING`,
                [name, VIEW_EXPRESSIONS[name]],
            );
        }
        await queryRunner.query(`CREATE INDEX "IDX_cc7d157cf5de83c706e4b93c4f" ON "http_responses" ("tech") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_27118f1a1f2a0b32462665b591" ON "http_responses" ("assetServiceId") `);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_http_responses_assetServiceId_createdAt"`);

        // ── 4. Drop FKs + the 5 facet tables ─────────────────────────────
        await queryRunner.query(`ALTER TABLE "dns_records" DROP CONSTRAINT "FK_d4ca3f09c0968f25a8028e60b1f"`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" DROP CONSTRAINT "FK_bd62f1f9efac18e986b3051e098"`);
        await queryRunner.query(`ALTER TABLE "tls_certificates" DROP CONSTRAINT "FK_cce0ba7d9416b9e25af0d66ff77"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" DROP CONSTRAINT "FK_35f21ddc046cbabe41a970b7356"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" DROP CONSTRAINT "FK_fe448bf65e89664023e25f6bf82"`);
        await queryRunner.query(`ALTER TABLE "ip_observations" DROP CONSTRAINT "FK_1c9f3a944e5d6ad5ca0da9b6711"`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" DROP CONSTRAINT "FK_42a28d7af8a26d434a0705314d8"`);
        await queryRunner.query(`ALTER TABLE "http_status_codes" DROP CONSTRAINT "FK_c8e0ef6905c388b86cebc59ca54"`);
        await queryRunner.query(`ALTER TABLE "http_response_technologies" DROP CONSTRAINT "FK_0196c5bcb03a029d41655498f90"`);
        await queryRunner.query(`ALTER TABLE "http_response_technologies" DROP CONSTRAINT "FK_2a4f83acc56355c0f8f89e5e6dd"`);
        await queryRunner.query(`DROP TABLE "dns_records"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_tls_certificates_assetServiceId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_tls_certificates_host"`);
        await queryRunner.query(`DROP TABLE "tls_certificates"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_ip_observations_http"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_ip_observations_asset"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ip_observations_ip"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_ip_observations_assetServiceId"`);
        await queryRunner.query(`DROP TABLE "ip_observations"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_http_status_codes_primary"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_http_status_codes_chain"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_http_status_codes_httpResponseId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_http_status_codes_assetServiceId"`);
        await queryRunner.query(`DROP TABLE "http_status_codes"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_http_response_technologies_assetServiceId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_http_response_technologies_name"`);
        await queryRunner.query(`DROP TABLE "http_response_technologies"`);
    }

}
