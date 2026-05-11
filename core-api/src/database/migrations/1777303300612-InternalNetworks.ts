import { MigrationInterface, QueryRunner } from "typeorm";

export class InternalNetworks1777303300612 implements MigrationInterface {
    name = 'InternalNetworks1777303300612'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "internal_networks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" text NOT NULL, "workspaceId" uuid NOT NULL, "createdBy" uuid NOT NULL, CONSTRAINT "PK_12c6669b7e2e3831783755b89b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "targets" ADD "internalNetworkId" uuid`);
        await queryRunner.query(`ALTER TABLE "internal_networks" ADD CONSTRAINT "FK_1f55c453f9dcf928e1428cdb2f6" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47"`);
        await queryRunner.query(`ALTER TABLE "internal_networks" DROP CONSTRAINT "FK_1f55c453f9dcf928e1428cdb2f6"`);
        await queryRunner.query(`ALTER TABLE "targets" DROP COLUMN "internalNetworkId"`);
        await queryRunner.query(`DROP TABLE "internal_networks"`);
    }

}
