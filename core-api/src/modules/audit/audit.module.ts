import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventsController } from './audit-events.controller';
import { AuditRetentionService } from './audit-retention.service';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditRetentionProcessor } from './processors/audit-retention.processor';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditEvent]),
    BullModule.registerQueue({ name: BullMQName.AUDIT_RETENTION }),
  ],
  controllers: [AuditEventsController],
  providers: [
    AuditService,
    AuditRetentionService,
    AuditRetentionProcessor,
  ],
  exports: [AuditService],
})
export class AuditModule {}
