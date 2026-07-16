import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTelegramConnects1784101236391 implements MigrationInterface {
    name = 'AddTelegramConnects1784101236391'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "telegram_connects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "telegramChatId" text, "telegramUsername" text, "telegramFirstName" text, "telegramLastName" text, "connectToken" text NOT NULL, "tokenExpiredAt" TIMESTAMP, "status" character varying NOT NULL DEFAULT 'PENDING', "isActive" boolean NOT NULL DEFAULT true, "integrationId" uuid NOT NULL, "userId" uuid NOT NULL, CONSTRAINT "UQ_51e6ff64e7db00edc59163a36f1" UNIQUE ("connectToken"), CONSTRAINT "PK_8045425f5cd087543cc4f2836a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_telegram_connects_status" ON "telegram_connects" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_telegram_connects_user" ON "telegram_connects" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_telegram_connects_integration" ON "telegram_connects" ("integrationId") `);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers":{}}'`);
        await queryRunner.query(`ALTER TABLE "telegram_connects" ADD CONSTRAINT "FK_988706004ba654c6029dbfa11fc" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "telegram_connects" ADD CONSTRAINT "FK_f1cf1feb749d46d41559d62f554" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "telegram_connects" DROP CONSTRAINT "FK_f1cf1feb749d46d41559d62f554"`);
        await queryRunner.query(`ALTER TABLE "telegram_connects" DROP CONSTRAINT "FK_988706004ba654c6029dbfa11fc"`);
        await queryRunner.query(`ALTER TABLE "agent_mcp_configs" ALTER COLUMN "configJson" SET DEFAULT '{"mcpServers": {}}'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_telegram_connects_integration"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_telegram_connects_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_telegram_connects_status"`);
        await queryRunner.query(`DROP TABLE "telegram_connects"`);
    }

}
