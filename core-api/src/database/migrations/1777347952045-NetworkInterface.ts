import { MigrationInterface, QueryRunner } from "typeorm";

export class NetworkInterface1777347952045 implements MigrationInterface {
    name = 'NetworkInterface1777347952045'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "network_interfaces" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "workerId" uuid NOT NULL, "interfaceName" text NOT NULL, "ipAddress" text NOT NULL, "cidr" text NOT NULL, "gatewayIp" text NOT NULL, "gatewayMac" text NOT NULL, "internalNetworkId" uuid NOT NULL, CONSTRAINT "PK_6fe8238659b6714aaf0e01ec7de" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "workers" ADD "internalNetworkId" uuid`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" ADD CONSTRAINT "FK_d6ac723da9e5db5db5e25c89069" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" ADD CONSTRAINT "FK_fbe5dac3139397a7324999aa4ee" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "workers" ADD CONSTRAINT "FK_0719352a547c69371ba538cdeb8" FOREIGN KEY ("internalNetworkId") REFERENCES "internal_networks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "internal_networks" ADD CONSTRAINT "FK_1b749549af4a13a4b2f8bfd983f" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "internal_networks" DROP CONSTRAINT "FK_1b749549af4a13a4b2f8bfd983f"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP CONSTRAINT "FK_0719352a547c69371ba538cdeb8"`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" DROP CONSTRAINT "FK_fbe5dac3139397a7324999aa4ee"`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" DROP CONSTRAINT "FK_d6ac723da9e5db5db5e25c89069"`);
        await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "internalNetworkId"`);
        await queryRunner.query(`DROP TABLE "network_interfaces"`);
    }

}
