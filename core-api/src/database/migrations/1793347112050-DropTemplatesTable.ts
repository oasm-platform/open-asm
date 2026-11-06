import { MigrationInterface, QueryRunner } from "typeorm";

// Custom templates now live in the workspace artifacts folder; the old table has no entity.
// Generated output held only unrelated index/constraint drift and was replaced with the drop.
export class DropTemplatesTable1793347112050 implements MigrationInterface {
    name = 'DropTemplatesTable1793347112050'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "templates"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "fileName" character varying NOT NULL, "path" character varying, "workspaceId" uuid, CONSTRAINT "PK_515948649ce0bbbe391de702ae5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_templates_workspace" ON "templates" ("workspaceId") `);
        await queryRunner.query(`ALTER TABLE "templates" ADD CONSTRAINT "FK_b8a4692f30364e281a01651340a" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
