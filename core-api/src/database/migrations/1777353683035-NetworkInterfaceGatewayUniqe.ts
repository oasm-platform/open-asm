import { MigrationInterface, QueryRunner } from "typeorm";

export class NetworkInterfaceGatewayUniqe1777353683035 implements MigrationInterface {
    name = 'NetworkInterfaceGatewayUniqe1777353683035'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "network_interfaces" ADD CONSTRAINT "UQ_a64be6ec6cafd4c548066c09f7b" UNIQUE ("internalNetworkId", "gatewayMac")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "network_interfaces" DROP CONSTRAINT "UQ_a64be6ec6cafd4c548066c09f7b"`);
    }

}
