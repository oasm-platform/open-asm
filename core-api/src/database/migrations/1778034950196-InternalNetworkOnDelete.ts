import { MigrationInterface, QueryRunner } from "typeorm";

export class InternalNetworkOnDelete1778034950196 implements MigrationInterface {
    name = 'InternalNetworkOnDelete1778034950196'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_0719352a547c69371ba538cdeb8"`);
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47"`);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_0719352a547c69371ba538cdeb8" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "targets" DROP CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_0719352a547c69371ba538cdeb8"`);
        await queryRunner.query(`ALTER TABLE "targets" ADD CONSTRAINT "FK_ae62ba1392e5528a646fe1fcd47" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_0719352a547c69371ba538cdeb8" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
