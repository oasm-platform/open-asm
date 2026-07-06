import { MigrationInterface, QueryRunner } from "typeorm";

export class UniqNetworkInterfaceCidr1777803613457 implements MigrationInterface {
    name = 'UniqNetworkInterfaceCidr1777803613457'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "network_interfaces" DROP CONSTRAINT "UQ_a64be6ec6cafd4c548066c09f7b"`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" ADD CONSTRAINT "UQ_08ace15a7f41ebf06d17251e93a" UNIQUE ("internalNetworkId", "gatewayMac", "cidr")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "network_interfaces" DROP CONSTRAINT "UQ_08ace15a7f41ebf06d17251e93a"`);
        await queryRunner.query(`ALTER TABLE "network_interfaces" ADD CONSTRAINT "UQ_a64be6ec6cafd4c548066c09f7b" UNIQUE ("gatewayMac", "internalNetworkId")`);
    }

}
