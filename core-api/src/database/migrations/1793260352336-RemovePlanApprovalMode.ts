import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The PLAN approval mode is gone: Agent mode has every new plan approved by
 * the user in either mode. Rows saved with it fall back to MANUAL, the
 * default. There is no going back to tell which rows were PLAN.
 */
export class RemovePlanApprovalMode1793260352336 implements MigrationInterface {
    name = 'RemovePlanApprovalMode1793260352336'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "agent_conversations" SET "approvalMode" = 'manual' WHERE "approvalMode" = 'plan'`);
        await queryRunner.query(`UPDATE "agent_configs" SET "defaultApprovalMode" = 'manual' WHERE "defaultApprovalMode" = 'plan'`);
    }

    public async down(): Promise<void> {
        // Data only: nothing to undo
    }

}
