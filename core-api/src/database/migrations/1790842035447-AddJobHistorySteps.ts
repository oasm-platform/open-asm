import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the workflow-DAG run state to `job_histories`.
 *
 * - `steps`  per-run state of every workflow step (dispatched / done / failed /
 *            skipped + reason + job count), keyed by step name. The workflow
 *            engine treats it as the source of truth for what else should run,
 *            which is what lets steps run in parallel and dependencies be
 *            expressed with `needs`.
 * - `scope`  the scan scope captured when the run started (`targetIds` for an
 *            event-triggered run, `assetIds` for an asset-group run), reused by
 *            every step dispatched later in the chain.
 *
 * NOTE: the generated file also contained unrelated FK/index churn from
 * pre-existing entity/schema drift; only the two columns above are kept.
 */
export class AddJobHistorySteps1790842035447 implements MigrationInterface {
  name = 'AddJobHistorySteps1790842035447';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "job_histories" ADD "steps" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "job_histories" ADD "scope" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "scope"`);
    await queryRunner.query(`ALTER TABLE "job_histories" DROP COLUMN "steps"`);
  }
}
