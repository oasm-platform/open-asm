import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertEnumColumnsToString1784014752144 implements MigrationInterface {
    name = 'ConvertEnumColumnsToString1784014752144'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Use ALTER COLUMN TYPE instead of DROP/ADD to preserve existing data
        // and avoid NOT NULL constraint failures on existing rows.
        // The USING clause casts the enum label to text, then to varchar.

        // api_keys.type
        await queryRunner.query(`ALTER TABLE "api_keys" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."api_keys_type_enum"`);

        // vulnerability_dismissals.reason
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" ALTER COLUMN "reason" TYPE varchar USING "reason"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vulnerability_dismissals_reason_enum"`);

        // vulnerabilities.severity
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_vuln_severity_isArchived"`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ALTER COLUMN "severity" TYPE varchar USING "severity"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ALTER COLUMN "severity" SET DEFAULT 'info'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vulnerabilities_severity_enum"`);

        // vulnerabilities.analyzeStatus
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ALTER COLUMN "analyzeStatus" TYPE varchar USING "analyzeStatus"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ALTER COLUMN "analyzeStatus" SET DEFAULT 'not_analyzed'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vulnerabilities_analyzestatus_enum"`);

        // workers.type
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "type" SET DEFAULT 'built_in'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."workers_type_enum"`);

        // workers.scope
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "scope" TYPE varchar USING "scope"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "workers" ALTER COLUMN "scope" SET DEFAULT 'workspace'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."workers_scope_enum"`);

        // tools.category
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "category" TYPE varchar USING "category"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."tools_category_enum"`);

        // tools.type
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "type" SET DEFAULT 'built_in'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."tools_type_enum"`);

        // tools.priority
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "priority" TYPE varchar USING "priority"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "tools" ALTER COLUMN "priority" SET DEFAULT '4'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."tools_priority_enum"`);

        // jobs.category
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_category_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_workerId_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_asset_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_status_priority_createdAt"`);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "category" TYPE varchar USING "category"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."jobs_category_enum"`);

        // jobs.status
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "status" TYPE varchar USING "status"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."jobs_status_enum"`);

        // jobs.priority
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "priority" TYPE varchar USING "priority"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "jobs" ALTER COLUMN "priority" SET DEFAULT '4'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."jobs_priority_enum"`);

        // job_histories.jobRunType
        await queryRunner.query(`ALTER TABLE "job_histories" ALTER COLUMN "jobRunType" TYPE varchar USING "jobRunType"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "job_histories" ALTER COLUMN "jobRunType" SET DEFAULT 'manual'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."job_histories_jobruntype_enum"`);

        // asset_group_workflows.schedule
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ALTER COLUMN "schedule" TYPE varchar USING "schedule"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ALTER COLUMN "schedule" SET DEFAULT 'disabled'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."asset_group_workflows_schedule_enum"`);

        // targets.type
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_targets_scanSchedule_jobId"`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "type" SET DEFAULT 'DOMAIN'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."targets_type_enum"`);

        // targets.scanSchedule
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "scanSchedule" TYPE varchar USING "scanSchedule"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "targets" ALTER COLUMN "scanSchedule" SET DEFAULT 'disabled'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."targets_scanschedule_enum"`);

        // workspace_members.role
        await queryRunner.query(`ALTER TABLE "workspace_members" ALTER COLUMN "role" TYPE varchar USING "role"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "workspace_members" ALTER COLUMN "role" SET DEFAULT 'owner'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."workspace_members_role_enum"`);

        // users.role
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar USING "role"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);

        // reports.type
        await queryRunner.query(`ALTER TABLE "reports" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "reports" ALTER COLUMN "type" SET DEFAULT 'SUMMARY'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."reports_type_enum"`);

        // notifications.scope
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "scope" TYPE varchar USING "scope"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notifications_scope_enum"`);

        // notifications.type
        await queryRunner.query(`ALTER TABLE "notifications" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notifications_type_enum"`);

        // notification_recipients.status
        await queryRunner.query(`ALTER TABLE "notification_recipients" ALTER COLUMN "status" TYPE varchar USING "status"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "notification_recipients" ALTER COLUMN "status" SET DEFAULT 'sent'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_recipients_status_enum"`);

        // issues.status
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_issues_workspaceId_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_issues_sourceType_sourceId_workspaceId_open"`);
        await queryRunner.query(`ALTER TABLE "issues" ALTER COLUMN "status" TYPE varchar USING "status"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'open'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."issues_status_enum"`);

        // issues.sourceType
        await queryRunner.query(`ALTER TABLE "issues" ALTER COLUMN "sourceType" TYPE varchar USING "sourceType"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."issues_sourcetype_enum"`);

        // issue_comments.type
        await queryRunner.query(`ALTER TABLE "issue_comments" ALTER COLUMN "type" TYPE varchar USING "type"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ALTER COLUMN "type" SET DEFAULT 'content'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."issue_comments_type_enum"`);

        // agent_messages.role
        await queryRunner.query(`ALTER TABLE "agent_messages" ALTER COLUMN "role" TYPE varchar USING "role"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_messages_role_enum"`);

        // agent_messages.messageType
        await queryRunner.query(`ALTER TABLE "agent_messages" ALTER COLUMN "messageType" TYPE varchar USING "messageType"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ALTER COLUMN "messageType" SET DEFAULT 'text'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_messages_messagetype_enum"`);

        // agent_conversations.agentMode
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "agentMode" TYPE varchar USING "agentMode"::text::varchar`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ALTER COLUMN "agentMode" SET DEFAULT 'ask'`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_conversations_agentmode_enum"`);

        // agent_llm_configs.provider
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" ALTER COLUMN "provider" TYPE varchar USING "provider"::text::varchar`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_llm_configs_provider_enum"`);

        // agent_mcp_configs.configJson default (unrelated but part of schema sync)
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);

        // Re-create indexes that were dropped for enum-dependent partial indexes
        await queryRunner.query(`CREATE INDEX "IDX_vuln_severity_isArchived" ON "vulnerabilities" ("severity", "isArchived") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_category_status" ON "jobs" ("category", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_workerId_status" ON "jobs" ("workerId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_asset_status" ON "jobs" ("assetId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_status_priority_createdAt" ON "jobs" ("status", "priority", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_targets_scanSchedule_jobId" ON "targets" ("scanSchedule", "jobId") `);
        await queryRunner.query(`CREATE INDEX "IDX_issues_sourceType_sourceId_workspaceId_open" ON "issues" ("sourceType", "sourceId", "workspaceId") WHERE status = 'open' AND "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_issues_workspaceId_status" ON "issues" ("workspaceId", "status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_issues_workspaceId_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_issues_sourceType_sourceId_workspaceId_open"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_targets_scanSchedule_jobId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_status_priority_createdAt"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_asset_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_workerId_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_jobs_category_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_vuln_severity_isArchived"`);

        // agent_mcp_configs
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);

        // agent_llm_configs.provider
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" DROP COLUMN "provider"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_llm_configs_provider_enum" AS ENUM('openai', 'openrouter', 'gemini', 'anthropic', 'kilo_code', 'custom')`);
        await queryRunner.query(`ALTER TABLE "agent_llm_configs" ADD "provider" "public"."agent_llm_configs_provider_enum" NOT NULL`);

        // agent_conversations.agentMode
        await queryRunner.query(`ALTER TABLE "agent_conversations" DROP COLUMN "agentMode"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_conversations_agentmode_enum" AS ENUM('ask', 'agent')`);
        await queryRunner.query(`ALTER TABLE "agent_conversations" ADD "agentMode" "public"."agent_conversations_agentmode_enum" NOT NULL DEFAULT 'ask'`);

        // agent_messages.messageType
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP COLUMN "messageType"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_messages_messagetype_enum" AS ENUM('text', 'thinking', 'error')`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD "messageType" "public"."agent_messages_messagetype_enum" NOT NULL DEFAULT 'text'`);

        // agent_messages.role
        await queryRunner.query(`ALTER TABLE "agent_messages" DROP COLUMN "role"`);
        await queryRunner.query(`CREATE TYPE "public"."agent_messages_role_enum" AS ENUM('user', 'assistant', 'system')`);
        await queryRunner.query(`ALTER TABLE "agent_messages" ADD "role" "public"."agent_messages_role_enum" NOT NULL`);

        // issue_comments.type
        await queryRunner.query(`ALTER TABLE "issue_comments" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."issue_comments_type_enum" AS ENUM('content', 'open', 'closed')`);
        await queryRunner.query(`ALTER TABLE "issue_comments" ADD "type" "public"."issue_comments_type_enum" NOT NULL DEFAULT 'content'`);

        // issues.sourceType
        await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN "sourceType"`);
        await queryRunner.query(`CREATE TYPE "public"."issues_sourcetype_enum" AS ENUM('vulnerability')`);
        await queryRunner.query(`ALTER TABLE "issues" ADD "sourceType" "public"."issues_sourcetype_enum"`);

        // issues.status
        await queryRunner.query(`ALTER TABLE "issues" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."issues_status_enum" AS ENUM('open', 'closed')`);
        await queryRunner.query(`ALTER TABLE "issues" ADD "status" "public"."issues_status_enum" NOT NULL DEFAULT 'open'`);
        await queryRunner.query(`CREATE INDEX "IDX_issues_sourceType_sourceId_workspaceId_open" ON "issues" ("sourceId", "sourceType", "workspaceId") WHERE ((status = 'open'::issues_status_enum) AND ("sourceType" IS NOT NULL) AND ("sourceId" IS NOT NULL))`);
        await queryRunner.query(`CREATE INDEX "IDX_issues_workspaceId_status" ON "issues" ("status", "workspaceId") `);

        // notification_recipients.status
        await queryRunner.query(`ALTER TABLE "notification_recipients" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."notification_recipients_status_enum" AS ENUM('sent', 'unread', 'read')`);
        await queryRunner.query(`ALTER TABLE "notification_recipients" ADD "status" "public"."notification_recipients_status_enum" NOT NULL DEFAULT 'sent'`);

        // notifications.type
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('WORKSPACE_CREATED', 'VULNERABILITY_ANALYSIS_COMPLETED', 'ASSET_NEW_DETECT')`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "type" "public"."notifications_type_enum" NOT NULL`);

        // notifications.scope
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "scope"`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_scope_enum" AS ENUM('SYSTEM', 'USER', 'GROUP')`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "scope" "public"."notifications_scope_enum" NOT NULL`);

        // reports.type
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."reports_type_enum" AS ENUM('SUMMARY', 'VULNERABILITY')`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "type" "public"."reports_type_enum" NOT NULL DEFAULT 'SUMMARY'`);

        // users.role
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user', 'bot')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`);

        // workspace_members.role
        await queryRunner.query(`ALTER TABLE "workspace_members" DROP COLUMN "role"`);
        await queryRunner.query(`CREATE TYPE "public"."workspace_members_role_enum" AS ENUM('owner', 'member')`);
        await queryRunner.query(`ALTER TABLE "workspace_members" ADD "role" "public"."workspace_members_role_enum" NOT NULL DEFAULT 'owner'`);

        // targets.scanSchedule
        await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "scanSchedule"`);
        await queryRunner.query(`CREATE TYPE "public"."targets_scanschedule_enum" AS ENUM('disabled', '0 0 * * *', '0 0 */3 * *', '0 0 * * 0', '0 0 */14 * *', '0 0 1 * *')`);
        await queryRunner.query(`ALTER TABLE "targets" ADD "scanSchedule" "public"."targets_scanschedule_enum" DEFAULT 'disabled'`);

        // targets.type
        await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."targets_type_enum" AS ENUM('DOMAIN', 'CIDR', 'IP')`);
        await queryRunner.query(`ALTER TABLE "targets" ADD "type" "public"."targets_type_enum" NOT NULL DEFAULT 'DOMAIN'`);
        await queryRunner.query(`CREATE INDEX "IDX_targets_scanSchedule_jobId" ON "targets" ("jobId", "scanSchedule") `);

        // asset_group_workflows.schedule
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" DROP COLUMN "schedule"`);
        await queryRunner.query(`CREATE TYPE "public"."asset_group_workflows_schedule_enum" AS ENUM('disabled', '0 0 * * *', '0 0 */3 * *', '0 0 * * 0', '0 0 */14 * *', '0 0 1 * *')`);
        await queryRunner.query(`ALTER TABLE "asset_group_workflows" ADD "schedule" "public"."asset_group_workflows_schedule_enum" NOT NULL DEFAULT 'disabled'`);

        // job_histories.jobRunType
        await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "jobRunType"`);
        await queryRunner.query(`CREATE TYPE "public"."job_histories_jobruntype_enum" AS ENUM('manual', 'scheduled')`);
        await queryRunner.query(`ALTER TABLE "job_histories" ADD "jobRunType" "public"."job_histories_jobruntype_enum" NOT NULL DEFAULT 'manual'`);

        // jobs.priority
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "priority"`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_priority_enum" AS ENUM('0', '1', '2', '3', '4')`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "priority" "public"."jobs_priority_enum" NOT NULL DEFAULT '4'`);

        // jobs.status
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled')`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'pending'`);

        // jobs.category
        await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "category"`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_category_enum" AS ENUM('subdomains', 'http_probe', 'ports_scanner', 'vulnerabilities', 'screenshot', 'classifier', 'assistant')`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD "category" "public"."jobs_category_enum" NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_status_priority_createdAt" ON "jobs" ("createdAt", "priority", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_asset_status" ON "jobs" ("assetId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_workerId_status" ON "jobs" ("status", "workerId") `);
        await queryRunner.query(`CREATE INDEX "IDX_jobs_category_status" ON "jobs" ("category", "status") `);

        // tools.priority
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "priority"`);
        await queryRunner.query(`CREATE TYPE "public"."tools_priority_enum" AS ENUM('0', '1', '2', '3', '4')`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "priority" "public"."tools_priority_enum" NOT NULL DEFAULT '4'`);

        // tools.type
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."tools_type_enum" AS ENUM('built_in', 'provider')`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "type" "public"."tools_type_enum" NOT NULL DEFAULT 'built_in'`);

        // tools.category
        await queryRunner.query(`ALTER TABLE "tools" DROP COLUMN "category"`);
        await queryRunner.query(`CREATE TYPE "public"."tools_category_enum" AS ENUM('subdomains', 'http_probe', 'ports_scanner', 'vulnerabilities', 'screenshot', 'classifier', 'assistant')`);
        await queryRunner.query(`ALTER TABLE "tools" ADD "category" "public"."tools_category_enum" NOT NULL`);

        // workers.scope
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "scope"`);
        await queryRunner.query(`CREATE TYPE "public"."workers_scope_enum" AS ENUM('cloud', 'workspace')`);
        await queryRunner.query(`ALTER TABLE "workers" ADD "scope" "public"."workers_scope_enum" NOT NULL DEFAULT 'workspace'`);

        // workers.type
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."workers_type_enum" AS ENUM('built_in', 'provider')`);
        await queryRunner.query(`ALTER TABLE "workers" ADD "type" "public"."workers_type_enum" NOT NULL DEFAULT 'built_in'`);

        // vulnerabilities.analyzeStatus
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "analyzeStatus"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerabilities_analyzestatus_enum" AS ENUM('not_analyzed', 'running', 'done', 'failed')`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "analyzeStatus" "public"."vulnerabilities_analyzestatus_enum" NOT NULL DEFAULT 'not_analyzed'`);

        // vulnerabilities.severity
        await queryRunner.query(`ALTER TABLE "vulnerabilities" DROP COLUMN "severity"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerabilities_severity_enum" AS ENUM('info', 'low', 'medium', 'high', 'critical')`);
        await queryRunner.query(`ALTER TABLE "vulnerabilities" ADD "severity" "public"."vulnerabilities_severity_enum" NOT NULL DEFAULT 'info'`);
        await queryRunner.query(`CREATE INDEX "IDX_vuln_severity_isArchived" ON "vulnerabilities" ("isArchived", "severity") `);

        // vulnerability_dismissals.reason
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" DROP COLUMN "reason"`);
        await queryRunner.query(`CREATE TYPE "public"."vulnerability_dismissals_reason_enum" AS ENUM('false_positive', 'used_in_test', 'wont_fix')`);
        await queryRunner.query(`ALTER TABLE "vulnerability_dismissals" ADD "reason" "public"."vulnerability_dismissals_reason_enum" NOT NULL`);

        // api_keys.type
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "type"`);
        await queryRunner.query(`CREATE TYPE "public"."api_keys_type_enum" AS ENUM('tool', 'workspace', 'mcp')`);
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "type" "public"."api_keys_type_enum" NOT NULL`);
    }
}
