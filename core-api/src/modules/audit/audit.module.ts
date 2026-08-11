import { BullMQName } from '@/common/enums/enum';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventsController } from './audit-events.controller';
import { AuditRetentionService } from './audit-retention.service';
import { AuditInterceptor } from './audit.interceptor';
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
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
