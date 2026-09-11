import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1788930000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1788930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Composite index for last-run query in AssetGroupService.getLastRunForWorkflows
    // The query does: SELECT ... FROM job_histories WHERE "workflowId" IN (...) ORDER BY "workflowId", "createdAt" DESC
    // A composite index on (workflowId, createdAt DESC) enables index-only distinctOn
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_histories_workflowId_createdAt" ON "job_histories" ("workflowId", "createdAt" DESC)`,
    );

    // 2. GIN index on workflows.content for JSONB path queries in TriggerWorkflowService
    // The query does: WHERE workflow.content -> 'on' -> :target ? :action
    // A GIN index with jsonb_ops enables efficient path lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflows_content_gin" ON "workflows" USING GIN ("content" jsonb_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflows_content_gin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_histories_workflowId_createdAt"`);
  }
}
