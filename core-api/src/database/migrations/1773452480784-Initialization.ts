import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Initialization1773452480784 implements MigrationInterface {
  name = 'Initialization1773452480784';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if this migration has already been executed
    const migrationExists: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM "migrations" WHERE "name" = $1 LIMIT 1`,
      [this.name],
    );

    if (migrationExists.length > 0) {
      return;
    }

    // Check if tables already exist (e.g., users table created by this migration)
    const tablesExist: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'users' LIMIT 1`,
    );

    if (tablesExist.length > 0) {
      // Tables exist but no migration record - insert migration record to mark as already executed
      await queryRunner.query(
        `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
        [1773452480784, this.name],
      );
      return;
    }

    await queryRunner.query(
      `CREATE TYPE "public"."api_keys_type_enum" AS ENUM('tool', 'workspace', 'mcp')`,
    );
    await queryRunner.query(
      `CREATE TABLE "api_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "key" character varying NOT NULL, "type" "public"."api_keys_type_enum" NOT NULL, "ref" character varying, "revokedAt" TIMESTAMP, "isRevoked" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_e42cf55faeafdcce01a82d24849" UNIQUE ("key"), CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_statistics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assets" integer NOT NULL DEFAULT '0', "targets" integer NOT NULL DEFAULT '0', "vuls" integer NOT NULL DEFAULT '0', "criticalVuls" integer NOT NULL DEFAULT '0', "highVuls" integer NOT NULL DEFAULT '0', "mediumVuls" integer NOT NULL DEFAULT '0', "lowVuls" integer NOT NULL DEFAULT '0', "infoVuls" integer NOT NULL DEFAULT '0', "techs" integer NOT NULL DEFAULT '0', "ports" integer NOT NULL DEFAULT '0', "services" integer NOT NULL DEFAULT '0', "score" numeric(5,2) NOT NULL DEFAULT '0', "workspaceId" uuid, CONSTRAINT "PK_cb8da8d54fcd66ff97f4ccbf2fb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."targets_scanschedule_enum" AS ENUM('disabled', '0 0 * * *', '0 0 */3 * *', '0 0 * * 0', '0 0 */14 * *', '0 0 1 * *')`,
    );
    await queryRunner.query(
      `CREATE TABLE "targets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "value" character varying NOT NULL, "lastDiscoveredAt" TIMESTAMP DEFAULT now(), "reScanCount" integer NOT NULL DEFAULT '0', "scanSchedule" "public"."targets_scanschedule_enum" DEFAULT 'disabled', "jobId" character varying, CONSTRAINT "PK_87084f49e9de9dd6a3e83906584" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_targets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid, "targetId" uuid, CONSTRAINT "UQ_584f07937c6e610d12640c05442" UNIQUE ("workspaceId", "targetId"), CONSTRAINT "PK_8cc7ce852abed30e32ec51758ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "fileName" character varying NOT NULL, "path" character varying, "workspaceId" uuid, CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_tools" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isEnabled" boolean NOT NULL DEFAULT true, "toolId" uuid, "workspaceId" uuid, CONSTRAINT "PK_f052b0107b988bd24b14d8eb606" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workers_type_enum" AS ENUM('built_in', 'provider')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workers_scope_enum" AS ENUM('cloud', 'workspace')`,
    );
    await queryRunner.query(
      `CREATE TABLE "workers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSeenAt" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying, "type" "public"."workers_type_enum" NOT NULL DEFAULT 'built_in', "scope" "public"."workers_scope_enum" NOT NULL DEFAULT 'workspace', "workspaceId" uuid, "toolId" uuid, CONSTRAINT "PK_e950c9aba3bd84a4f193058d838" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."asset_group_workflows_schedule_enum" AS ENUM('disabled', '0 0 * * *', '0 0 */3 * *', '0 0 * * 0', '0 0 */14 * *', '0 0 1 * *')`,
    );
    await queryRunner.query(
      `CREATE TABLE "asset_group_workflows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "schedule" "public"."asset_group_workflows_schedule_enum" NOT NULL DEFAULT 'disabled', "jobId" character varying, "assetGroupId" uuid, "workflowId" uuid, CONSTRAINT "PK_bcacdb266f0a7df6e9d9733d00e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "http_responses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "timestamp" TIMESTAMP WITH TIME ZONE, "tls" jsonb, "port" character varying, "url" character varying, "input" character varying, "title" text, "scheme" character varying, "webserver" character varying, "body" text, "content_type" character varying, "method" character varying, "host" character varying, "path" character varying, "favicon" character varying, "favicon_md5" character varying, "favicon_url" character varying, "header" jsonb, "raw_header" text, "request" text, "time" character varying, "a" character varying array, "tech" character varying array, "words" integer, "lines" integer, "status_code" integer, "content_length" integer, "failed" boolean NOT NULL DEFAULT false, "knowledgebase" jsonb, "resolvers" character varying array, "chain_status_codes" character varying array, "assetServiceId" uuid, "jobHistoryId" uuid, CONSTRAINT "PK_34b48204dfadf85a168f61fd898" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc7d157cf5de83c706e4b93c4f" ON "http_responses" ("tech") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_27118f1a1f2a0b32462665b591" ON "http_responses" ("assetServiceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "ports" integer array NOT NULL, "assetId" character varying, "jobHistoryId" uuid, CONSTRAINT "PK_291c9f372b1ce97c885e96f5ff4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "vulnerability_dismissals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "vulnerabilityId" uuid NOT NULL, "userId" uuid NOT NULL, "reason" character varying NOT NULL, "comment" character varying, CONSTRAINT "UQ_ba00c6117325d322aa2b3683b23" UNIQUE ("vulnerabilityId"), CONSTRAINT "REL_ba00c6117325d322aa2b3683b2" UNIQUE ("vulnerabilityId"), CONSTRAINT "PK_40a07ee5c602766acec8bb4a3af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "vulnerabilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "description" character varying, "synopsis" character varying, "severity" character varying NOT NULL DEFAULT 'info', "tags" text array, "references" text array, "authors" text array, "affectedUrl" character varying, "ipAddress" character varying, "host" character varying, "ports" text array, "cvssMetric" character varying, "cvssScore" double precision, "epssScore" double precision, "vprScore" double precision, "cveId" text array, "bidId" text array, "cweId" text array, "ceaId" text array, "iava" text array, "cveUrl" text, "cweUrl" text, "solution" text, "extractorName" character varying, "extractedResults" text array, "publicationDate" TIMESTAMP WITH TIME ZONE, "modificationDate" TIMESTAMP WITH TIME ZONE, "filePath" character varying, "jobHistoryId" uuid, "isArchived" boolean NOT NULL DEFAULT false, "fingerprint" character varying, "toolId" uuid, "assetId" uuid, CONSTRAINT "UQ_f5a93b9c006858e4b051713eac2" UNIQUE ("fingerprint"), CONSTRAINT "UQ_f5a93b9c006858e4b051713eac2" UNIQUE ("fingerprint"), CONSTRAINT "PK_ee96a1a8d70c431bc2d86485502" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_histories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "pendingJobsCount" integer NOT NULL DEFAULT '0', "isCompleted" boolean NOT NULL DEFAULT false, "workflowId" uuid, CONSTRAINT "PK_b9a396eac69b70be925389be7a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workflows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "content" jsonb NOT NULL, "filePath" character varying NOT NULL, "isCanDelete" boolean NOT NULL DEFAULT true, "isCanEdit" boolean NOT NULL DEFAULT true, "createdBy" uuid, "workspaceId" uuid, CONSTRAINT "PK_5b5757cc1cd86268019fef52e0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_048ab2a9f601092136b4f221c1" ON "workflows" ("filePath", "workspaceId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workspace_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workspaceId" uuid, "userId" uuid, CONSTRAINT "PK_22ab43ac5865cd62769121d2bc4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "workspaces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL, "description" text, "deletedAt" TIMESTAMP, "archivedAt" TIMESTAMP, "isAssetsDiscovery" boolean NOT NULL DEFAULT true, "isAutoEnableAssetAfterDiscovered" boolean NOT NULL DEFAULT true, "ownerId" uuid, "apiKeyId" uuid, CONSTRAINT "REL_5e888e05b7e53345908325eb5c" UNIQUE ("apiKeyId"), CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "asset_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "hexColor" character varying DEFAULT '#78716C', "workspaceId" uuid, CONSTRAINT "UQ_d1c6dfd6a740b46f543fe0a721c" UNIQUE ("name", "workspaceId"), CONSTRAINT "PK_1e8f37dccf890f00482ac0bb1ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "assets_group_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "assetGroupId" uuid, "assetId" uuid, CONSTRAINT "PK_491c815ecb7be371fd5abe9effb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "value" character varying NOT NULL, "targetId" uuid, "isPrimary" boolean NOT NULL DEFAULT false, "dnsRecords" json, "isEnabled" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_44ea9bb528929807a6489b64aef" UNIQUE ("value", "targetId"), CONSTRAINT "PK_da96729a8b113377cfb6a62439c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_error_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "logMessage" character varying NOT NULL, "payload" character varying NOT NULL, "jobId" uuid, CONSTRAINT "PK_74e5fd465894a178ed1a0c8eb20" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_category_enum" AS ENUM('subdomains', 'http_probe', 'ports_scanner', 'vulnerabilities', 'screenshot', 'classifier', 'assistant')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_status_enum" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_priority_enum" AS ENUM('0', '1', '2', '3', '4')`,
    );
    await queryRunner.query(
      `CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "category" "public"."jobs_category_enum" NOT NULL, "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'pending', "pickJobAt" TIMESTAMP, "priority" "public"."jobs_priority_enum" NOT NULL DEFAULT '4', "workerId" character varying, "rawResult" json, "completedAt" TIMESTAMP, "isSaveRawResult" boolean NOT NULL DEFAULT false, "isSaveData" boolean NOT NULL DEFAULT true, "isPublishEvent" boolean NOT NULL DEFAULT false, "pathResult" character varying, "command" character varying, "assetServiceId" uuid, "retryCount" integer NOT NULL DEFAULT '0', "assetId" uuid, "toolId" uuid, "jobHistoryId" uuid, CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "asset_services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "value" character varying NOT NULL, "port" integer NOT NULL, "assetId" uuid NOT NULL, "isErrorPage" boolean NOT NULL DEFAULT false, "screenshotPath" character varying, CONSTRAINT "UQ_693ce56f1f42942c812113c4e8f" UNIQUE ("assetId", "port"), CONSTRAINT "PK_4503b48264300e163f0b4096eeb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c5b75bea43c795941c721a3ce8" ON "asset_services" ("port") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff2924d9a89f955c75ce04f162" ON "asset_services" ("isErrorPage") WHERE "isErrorPage" = false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1533a0a0bb379a6cb6015cb941" ON "asset_services" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "asset_services_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tag" character varying NOT NULL, "assetServiceId" uuid NOT NULL, "toolId" uuid, CONSTRAINT "PK_420f7c20ba0545fa60cf1968edd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tools_category_enum" AS ENUM('subdomains', 'http_probe', 'ports_scanner', 'vulnerabilities', 'screenshot', 'classifier', 'assistant')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tools_type_enum" AS ENUM('built_in', 'provider')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tools" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "description" character varying, "command" character varying, "category" "public"."tools_category_enum" NOT NULL, "version" character varying, "logoUrl" character varying, "isBuiltIn" boolean NOT NULL DEFAULT false, "isOfficialSupport" boolean NOT NULL DEFAULT false, "type" "public"."tools_type_enum" NOT NULL DEFAULT 'built_in', "providerId" uuid, "priority" integer NOT NULL DEFAULT '4', "apiKeyId" uuid, CONSTRAINT "UQ_d95e4bbca1f6fffc98a6cf12973" UNIQUE ("name"), CONSTRAINT "REL_704dcc1f011ae1e439c08168d2" UNIQUE ("apiKeyId"), CONSTRAINT "PK_e23d56734caad471277bad8bf85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tool_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "description" text, "logoUrl" character varying, "websiteUrl" character varying, "supportEmail" character varying, "company" character varying, "licenseInfo" text, "apiDocsUrl" character varying, "isActive" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, "ownerId" uuid, CONSTRAINT "UQ_7400e7ba1e3375a72a274b9d613" UNIQUE ("code"), CONSTRAINT "PK_c3d34d2546cb210e838b02553e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "search_histories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "query" character varying, "userId" uuid NOT NULL, CONSTRAINT "PK_55eb6ed37ed8a334b599b3dfe66" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "accountId" text NOT NULL, "providerId" text NOT NULL, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" TIMESTAMP, "refreshTokenExpiresAt" TIMESTAMP, "scope" text, "password" text, "userId" uuid, CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP NOT NULL, "token" text NOT NULL, "ipAddress" text, "userAgent" text, "userId" uuid, "impersonatedById" uuid, CONSTRAINT "UQ_e9f62f5dcb8a54b84234c9e7a06" UNIQUE ("token"), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user', 'bot')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL, "email" text NOT NULL, "emailVerified" boolean NOT NULL, "image" text, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "language" text NOT NULL DEFAULT 'en', "banExpires" date, "banned" boolean, "banReason" text, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "mcp_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL DEFAULT 'Unnamed', "description" character varying, "value" json NOT NULL, "ownerId" uuid, CONSTRAINT "PK_7e72f74f84b8571d99f647d0151" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "system_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL DEFAULT 'Open ASM', "logoPath" text, CONSTRAINT "PK_29ac548e654c799fd885e1b9b71" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_scope_enum" AS ENUM('SYSTEM', 'USER', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('WORKSPACE_CREATED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "scope" "public"."notifications_scope_enum" NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "metadata" jsonb NOT NULL, "workspaceId" uuid, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_recipients_status_enum" AS ENUM('sent', 'unread', 'read')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_recipients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "notificationId" uuid NOT NULL, "userId" uuid NOT NULL, "status" "public"."notification_recipients_status_enum" NOT NULL DEFAULT 'sent', CONSTRAINT "PK_bd5b25c456987261a38c762b223" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "issue_comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "content" character varying NOT NULL, "createdById" uuid, "issueId" uuid NOT NULL, "isCanDelete" boolean NOT NULL DEFAULT true, "isCanEdit" boolean NOT NULL DEFAULT true, "type" character varying NOT NULL DEFAULT 'content', "repCommentId" uuid, "deletedAt" TIMESTAMP, CONSTRAINT "PK_c650a2d6817045a0c8ce74f09f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."issues_status_enum" AS ENUM('open', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."issues_sourcetype_enum" AS ENUM('vulnerability')`,
    );
    await queryRunner.query(
      `CREATE TABLE "issues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "title" character varying NOT NULL, "description" character varying, "status" "public"."issues_status_enum" NOT NULL DEFAULT 'open', "sourceType" "public"."issues_sourcetype_enum", "sourceId" character varying, "workspaceId" uuid, "no" integer NOT NULL DEFAULT '0', "tags" text, "createdById" uuid, CONSTRAINT "PK_9d8ecbbeff46229c700f0449257" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_2127ad1b143cf012280390b01d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_statistics" ADD CONSTRAINT "FK_f34fc0f16afe8444ae433d25636" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" ADD CONSTRAINT "FK_94d1527f0d73cc42744bc774552" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" ADD CONSTRAINT "FK_168278b842b85e1a002810d707b" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "templates" ADD CONSTRAINT "FK_b8a4692f30364e281a01651340a" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_tools" ADD CONSTRAINT "FK_dbf87000c6e647910dae0b7ca09" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_tools" ADD CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" ADD CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" ADD CONSTRAINT "FK_7958b532abdcf9b74629a6f297b" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_group_workflows" ADD CONSTRAINT "FK_1d91e7329d311307ee7d72a213d" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "http_responses" ADD CONSTRAINT "FK_27118f1a1f2a0b32462665b591a" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "http_responses" ADD CONSTRAINT "FK_91b96a63361ed291c5316cfb849" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ports" ADD CONSTRAINT "FK_aa01d9a6b67f27ff6e8bc9fe2cb" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerability_dismissals" ADD CONSTRAINT "FK_95bb810bafdd84ec1e9a8e922aa" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerability_dismissals" ADD CONSTRAINT "FK_ba00c6117325d322aa2b3683b23" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" ADD CONSTRAINT "FK_e9d47ee317de3073bef6897b4ae" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" ADD CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" ADD CONSTRAINT "FK_f32a67d7addcf191d352c83779f" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD CONSTRAINT "FK_091b24d4d0feee0acb09b90aaaf" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_2d3b556a484251c8d3456b62716" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "FK_ea41b368d8f4373d76b58112897" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_0dd45cb52108d0664df4e7e33e6" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_members" ADD CONSTRAINT "FK_22176b38813258c2aadaae32448" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD CONSTRAINT "FK_77607c5b6af821ec294d33aab0c" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" ADD CONSTRAINT "FK_5e888e05b7e53345908325eb5c3" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_groups" ADD CONSTRAINT "FK_54ff1d9c294707e71753fec2b18" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_6fa72968a572d63e85086b58aec" FOREIGN KEY ("assetGroupId") REFERENCES "asset_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets_group_assets" ADD CONSTRAINT "FK_05289fd83f48eeae11d258143af" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" ADD CONSTRAINT "FK_ce4c76c97d6250442690acd57c4" FOREIGN KEY ("targetId") REFERENCES "targets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_error_log" ADD CONSTRAINT "FK_84a2f22f65de286bd33ec1f36ce" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "FK_bf8d245ee6323f673d535048dca" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "FK_9a925aac2e224c4722f7ff20f5e" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "FK_9d190e9eb53feaec05fae010c7f" FOREIGN KEY ("jobHistoryId") REFERENCES "job_histories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD CONSTRAINT "FK_d8a28edf869424b129df4879d5a" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services" ADD CONSTRAINT "FK_014a31dea7a564c91b44efbd86c" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services_tags" ADD CONSTRAINT "FK_f74752b59a3fb55a09716f0596b" FOREIGN KEY ("assetServiceId") REFERENCES "asset_services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services_tags" ADD CONSTRAINT "FK_2a1732d44a4ef619467f26d63eb" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tools" ADD CONSTRAINT "FK_dda1871fb567020b19b49628550" FOREIGN KEY ("providerId") REFERENCES "tool_providers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tools" ADD CONSTRAINT "FK_704dcc1f011ae1e439c08168d29" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_providers" ADD CONSTRAINT "FK_67d937b10d56e4844e1cbe0eb3f" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_histories" ADD CONSTRAINT "FK_6e5161d02385b12c2cffbb1a59a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD CONSTRAINT "FK_3aa23c0a6d107393e8b40e3e2a6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_d18286170a7fe89ae4e6306d578" FOREIGN KEY ("impersonatedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_permissions" ADD CONSTRAINT "FK_3aed92ab508c8e6274ffaaf5ee4" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_0252715141cc24f79871554e249" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD CONSTRAINT "FK_234adaa36f97dd1b2bd3a22d65b" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" ADD CONSTRAINT "FK_452385a8220b8053ab65317ffa6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" ADD CONSTRAINT "FK_b4c4200d8d9e9954e867fe967ab" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" ADD CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" ADD CONSTRAINT "FK_4146db09b8fc3116c4940209438" FOREIGN KEY ("repCommentId") REFERENCES "issue_comments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issues" ADD CONSTRAINT "FK_53edb5e14a09491261b628e0401" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issues" ADD CONSTRAINT "FK_6ec638588b8a31143a6ac931ffa" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`CREATE VIEW "ip_assets_view" AS SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'A') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL

    UNION ALL

    SELECT
        a.id as "assetId",
        jsonb_array_elements_text(a."dnsRecords"::jsonb -> 'AAAA') AS ip
    FROM assets a
    WHERE a."targetId" IS NOT NULL`);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      [
        'public',
        'VIEW',
        'ip_assets_view',
        'SELECT\n        a.id as "assetId",\n        jsonb_array_elements_text(a."dnsRecords"::jsonb -> \'A\') AS ip\n    FROM assets a\n    WHERE a."targetId" IS NOT NULL\n\n    UNION ALL\n\n    SELECT\n        a.id as "assetId",\n        jsonb_array_elements_text(a."dnsRecords"::jsonb -> \'AAAA\') AS ip\n    FROM assets a\n    WHERE a."targetId" IS NOT NULL',
      ],
    );
    await queryRunner.query(`CREATE VIEW "status_code_asset_services_view" AS 
        SELECT http_responses.status_code AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses
        UNION
        SELECT UNNEST(chain_status_codes)::INT AS "statusCode",
              http_responses."assetServiceId"
        FROM http_responses
      `);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      [
        'public',
        'VIEW',
        'status_code_asset_services_view',
        'SELECT http_responses.status_code AS "statusCode",\n              http_responses."assetServiceId"\n        FROM http_responses\n        UNION\n        SELECT UNNEST(chain_status_codes)::INT AS "statusCode",\n              http_responses."assetServiceId"\n        FROM http_responses',
      ],
    );
    await queryRunner.query(`CREATE VIEW "tls_assets_view" AS 
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
  `);
    await queryRunner.query(
      `INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (DEFAULT, $1, DEFAULT, $2, $3, $4)`,
      [
        'public',
        'VIEW',
        'tls_assets_view',
        "SELECT DISTINCT ON (hr.tls->>'host', hr.\"assetServiceId\")\n      hr.\"assetServiceId\",\n      hr.tls->>'host'           AS host,\n      hr.tls->>'sni'            AS sni,\n      hr.tls->>'subject_dn'     AS subject_dn,\n      hr.tls->>'subject_cn'     AS subject_cn,\n      hr.tls->>'issuer_dn'      AS issuer_dn,\n      hr.tls->>'not_before'     AS not_before,\n      hr.tls->>'not_after'      AS not_after,\n      hr.tls->>'tls_version'    AS tls_version,\n      hr.tls->>'cipher'         AS cipher,\n      hr.tls->>'tls_connection' AS tls_connection,\n      (hr.tls->'subject_an')::text AS subject_an\n    FROM http_responses hr\n    WHERE hr.tls IS NOT NULL\n    ORDER BY hr.tls->>'host', hr.\"assetServiceId\", hr.\"createdAt\" DESC",
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['VIEW', 'tls_assets_view', 'public'],
    );
    await queryRunner.query(`DROP VIEW "tls_assets_view"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['VIEW', 'status_code_asset_services_view', 'public'],
    );
    await queryRunner.query(`DROP VIEW "status_code_asset_services_view"`);
    await queryRunner.query(
      `DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "schema" = $3`,
      ['VIEW', 'ip_assets_view', 'public'],
    );
    await queryRunner.query(`DROP VIEW "ip_assets_view"`);
    await queryRunner.query(
      `ALTER TABLE "issues" DROP CONSTRAINT "FK_6ec638588b8a31143a6ac931ffa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issues" DROP CONSTRAINT "FK_53edb5e14a09491261b628e0401"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" DROP CONSTRAINT "FK_4146db09b8fc3116c4940209438"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" DROP CONSTRAINT "FK_94b28cbe4b8110d9fedcb44c489"`,
    );
    await queryRunner.query(
      `ALTER TABLE "issue_comments" DROP CONSTRAINT "FK_b4c4200d8d9e9954e867fe967ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_452385a8220b8053ab65317ffa6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_recipients" DROP CONSTRAINT "FK_234adaa36f97dd1b2bd3a22d65b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_0252715141cc24f79871554e249"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_permissions" DROP CONSTRAINT "FK_3aed92ab508c8e6274ffaaf5ee4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_d18286170a7fe89ae4e6306d578"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP CONSTRAINT "FK_3aa23c0a6d107393e8b40e3e2a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_histories" DROP CONSTRAINT "FK_6e5161d02385b12c2cffbb1a59a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tool_providers" DROP CONSTRAINT "FK_67d937b10d56e4844e1cbe0eb3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tools" DROP CONSTRAINT "FK_704dcc1f011ae1e439c08168d29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tools" DROP CONSTRAINT "FK_dda1871fb567020b19b49628550"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services_tags" DROP CONSTRAINT "FK_2a1732d44a4ef619467f26d63eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services_tags" DROP CONSTRAINT "FK_f74752b59a3fb55a09716f0596b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_services" DROP CONSTRAINT "FK_014a31dea7a564c91b44efbd86c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP CONSTRAINT "FK_d8a28edf869424b129df4879d5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP CONSTRAINT "FK_9d190e9eb53feaec05fae010c7f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP CONSTRAINT "FK_9a925aac2e224c4722f7ff20f5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP CONSTRAINT "FK_bf8d245ee6323f673d535048dca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_error_log" DROP CONSTRAINT "FK_84a2f22f65de286bd33ec1f36ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets" DROP CONSTRAINT "FK_ce4c76c97d6250442690acd57c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_05289fd83f48eeae11d258143af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets_group_assets" DROP CONSTRAINT "FK_6fa72968a572d63e85086b58aec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_groups" DROP CONSTRAINT "FK_54ff1d9c294707e71753fec2b18"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP CONSTRAINT "FK_5e888e05b7e53345908325eb5c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspaces" DROP CONSTRAINT "FK_77607c5b6af821ec294d33aab0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_members" DROP CONSTRAINT "FK_22176b38813258c2aadaae32448"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_members" DROP CONSTRAINT "FK_0dd45cb52108d0664df4e7e33e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_ea41b368d8f4373d76b58112897"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "FK_2d3b556a484251c8d3456b62716"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_histories" DROP CONSTRAINT "FK_091b24d4d0feee0acb09b90aaaf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" DROP CONSTRAINT "FK_f32a67d7addcf191d352c83779f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" DROP CONSTRAINT "FK_f7e68acbb73cc61c0496f67d851"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerabilities" DROP CONSTRAINT "FK_e9d47ee317de3073bef6897b4ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerability_dismissals" DROP CONSTRAINT "FK_ba00c6117325d322aa2b3683b23"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vulnerability_dismissals" DROP CONSTRAINT "FK_95bb810bafdd84ec1e9a8e922aa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ports" DROP CONSTRAINT "FK_aa01d9a6b67f27ff6e8bc9fe2cb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "http_responses" DROP CONSTRAINT "FK_91b96a63361ed291c5316cfb849"`,
    );
    await queryRunner.query(
      `ALTER TABLE "http_responses" DROP CONSTRAINT "FK_27118f1a1f2a0b32462665b591a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_1d91e7329d311307ee7d72a213d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "asset_group_workflows" DROP CONSTRAINT "FK_b49dbca7f4cf406bd42786f3f0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" DROP CONSTRAINT "FK_7958b532abdcf9b74629a6f297b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" DROP CONSTRAINT "FK_f2fd09d8d31a1ac0a84a0cbb780"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_tools" DROP CONSTRAINT "FK_cb01f0a705ff81d8a94969fc553"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_tools" DROP CONSTRAINT "FK_dbf87000c6e647910dae0b7ca09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "templates" DROP CONSTRAINT "FK_b8a4692f30364e281a01651340a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" DROP CONSTRAINT "FK_168278b842b85e1a002810d707b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_targets" DROP CONSTRAINT "FK_94d1527f0d73cc42744bc774552"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workspace_statistics" DROP CONSTRAINT "FK_f34fc0f16afe8444ae433d25636"`,
    );
    await queryRunner.query(`DROP TABLE "verifications"`);
    await queryRunner.query(`DROP TABLE "issues"`);
    await queryRunner.query(`DROP TYPE "public"."issues_sourcetype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."issues_status_enum"`);
    await queryRunner.query(`DROP TABLE "issue_comments"`);
    await queryRunner.query(`DROP TABLE "notification_recipients"`);
    await queryRunner.query(
      `DROP TYPE "public"."notification_recipients_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notifications_scope_enum"`);
    await queryRunner.query(`DROP TABLE "system_configs"`);
    await queryRunner.query(`DROP TABLE "mcp_permissions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TABLE "search_histories"`);
    await queryRunner.query(`DROP TABLE "tool_providers"`);
    await queryRunner.query(`DROP TABLE "tools"`);
    await queryRunner.query(`DROP TYPE "public"."tools_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."tools_category_enum"`);
    await queryRunner.query(`DROP TABLE "asset_services_tags"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1533a0a0bb379a6cb6015cb941"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff2924d9a89f955c75ce04f162"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c5b75bea43c795941c721a3ce8"`,
    );
    await queryRunner.query(`DROP TABLE "asset_services"`);
    await queryRunner.query(`DROP TABLE "jobs"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."jobs_category_enum"`);
    await queryRunner.query(`DROP TABLE "job_error_log"`);
    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`DROP TABLE "assets_group_assets"`);
    await queryRunner.query(`DROP TABLE "asset_groups"`);
    await queryRunner.query(`DROP TABLE "workspaces"`);
    await queryRunner.query(`DROP TABLE "workspace_members"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_048ab2a9f601092136b4f221c1"`,
    );
    await queryRunner.query(`DROP TABLE "workflows"`);
    await queryRunner.query(`DROP TABLE "job_histories"`);
    await queryRunner.query(`DROP TABLE "vulnerabilities"`);
    await queryRunner.query(`DROP TABLE "vulnerability_dismissals"`);
    await queryRunner.query(`DROP TABLE "ports"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_27118f1a1f2a0b32462665b591"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc7d157cf5de83c706e4b93c4f"`,
    );
    await queryRunner.query(`DROP TABLE "http_responses"`);
    await queryRunner.query(`DROP TABLE "asset_group_workflows"`);
    await queryRunner.query(
      `DROP TYPE "public"."asset_group_workflows_schedule_enum"`,
    );
    await queryRunner.query(`DROP TABLE "workers"`);
    await queryRunner.query(`DROP TYPE "public"."workers_scope_enum"`);
    await queryRunner.query(`DROP TYPE "public"."workers_type_enum"`);
    await queryRunner.query(`DROP TABLE "workspace_tools"`);
    await queryRunner.query(`DROP TABLE "templates"`);
    await queryRunner.query(`DROP TABLE "workspace_targets"`);
    await queryRunner.query(`DROP TABLE "targets"`);
    await queryRunner.query(`DROP TYPE "public"."targets_scanschedule_enum"`);
    await queryRunner.query(`DROP TABLE "workspace_statistics"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP TYPE "public"."api_keys_type_enum"`);
  }
}
