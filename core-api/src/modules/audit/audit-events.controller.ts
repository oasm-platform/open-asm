import { WorkspaceAccess } from '@/common/decorators/workspace-access.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { IdQueryParamDto } from '@/common/dtos/id-query-param.dto';
import { AuditOutcome } from '@/common/enums/enum';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';
import { AuditService } from './audit.service';
import {
  AuditActionCatalogResponseDto,
  AuditEventListResponseDto,
  AuditEventResponseDto,
  GetAuditEventsQueryDto,
} from './dto/audit.dto';
import { AuditEvent } from './entities/audit-event.entity';
import { AUDIT_ACTION_CATALOG } from './constants/audit-events';

/**
 * CSV column order (plan §7). changes/metadata are JSON-encoded; occurredAt
 * is emitted as an ISO-8601 string; actorName/actorEmail may be empty after
 * GDPR pseudonymization.
 */
const CSV_HEADER = [
  'id',
  'occurredAt',
  'actorId',
  'actorType',
  'actorName',
  'actorEmail',
  'action',
  'resourceType',
  'resourceId',
  'outcome',
  'sourceIp',
  'userAgent',
  'requestId',
  'correlationId',
  'changes',
  'metadata',
] as const;

/**
 * RFC-style CSV escaping: fields containing `"`, `,`, or a line break are
 * wrapped in double quotes with inner quotes doubled. Dates → ISO strings;
 * objects (changes/metadata) → compact JSON.
 */
const toCsvField = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  // CWE-1236 (CSV formula injection): a field starting with = + - @ tab or CR
  // would be evaluated as a formula by spreadsheet apps. Neutralize by
  // prefixing a single quote — BEFORE RFC-quoting, so the exported field can
  // never begin with a formula character.
  const field = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
};

/** Serializes audit rows into CSV (header + one line per row). */
export function toAuditCsv(rows: AuditEvent[]): string {
  const lines = rows.map((row) =>
    [
      row.id,
      row.occurredAt,
      row.actorId,
      row.actorType,
      row.actorName,
      row.actorEmail,
      row.action,
      row.resourceType,
      row.resourceId,
      row.outcome,
      row.sourceIp,
      row.userAgent,
      row.requestId,
      row.correlationId,
      row.changes,
      row.metadata,
    ]
      .map(toCsvField)
      .join(','),
  );
  return [CSV_HEADER.join(','), ...lines].join('\n');
}

@ApiTags('Audit')
@Controller('workspaces')
export class AuditEventsController {
  constructor(private readonly auditService: AuditService) {}

  @Doc({
    summary: 'List workspace audit events',
    description:
      'Keyset-paginated audit trail for the workspace, newest first. ' +
      'Filters: actorId, action (dictionary-validated), resourceType, ' +
      'outcome, from, to. Requires audit.read.',
    response: {
      serialization: AuditEventListResponseDto,
    },
  })
  @WorkspaceAccess('audit.read', { workspaceParam: 'id' })
  @Get(':id/audit')
  async getAuditEvents(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetAuditEventsQueryDto,
  ): Promise<AuditEventListResponseDto> {
    const { data, nextCursor } = await this.auditService.queryEvents(id, query);
    return {
      data: data.map((event) => plainToInstance(AuditEventResponseDto, event)),
      nextCursor,
    };
  }

  /**
   * Action catalog (action → display label). Pure constant — no DB access;
   * the workspace param exists only so the guard can authorize the request.
   * The console builds its action filter dropdown and table labels from this
   * endpoint instead of a hardcoded client-side map.
   */
  @Doc({
    summary: 'List audit action catalog',
    description:
      'Action → display label pairs for the audit trail, derived from the ' +
      'backend AUDIT_ACTION_CATALOG constant. No database access. Requires ' +
      'audit.read.',
    response: {
      serialization: AuditActionCatalogResponseDto,
    },
  })
  @WorkspaceAccess('audit.read', { workspaceParam: 'id' })
  @Get(':id/audit/actions')
  getAuditActions(
    // Consumed only by the route/guard; the catalog itself is workspace-agnostic.
    @Param('id') _id: string,
  ): AuditActionCatalogResponseDto {
    return {
      data: AUDIT_ACTION_CATALOG.map(({ action, label }) => ({ action, label })),
    };
  }

  /**
   * CSV export, capped at 10k rows (400 beyond — narrow the filters). The
   * export is itself audited: audit.exported is written via auditSafely
   * BEFORE the stream starts (best-effort, never breaks the download). A cap
   * rejection above happens inside exportEvents first, so it never
   * self-logs. Follows the reports-controller convention of a raw @Res()
   * response instead of @StreamableFile (repo has no streaming helper).
   */
  @WorkspaceAccess('audit.read', { workspaceParam: 'id' })
  @Get(':id/audit/export')
  async exportAuditEvents(
    @Param() { id }: IdQueryParamDto,
    @Query() query: GetAuditEventsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.auditService.exportEvents(id, query);

    await this.auditService.auditSafely({
      ...this.auditService.buildActorContext(req as RequestWithMetadata),
      workspaceId: id,
      action: 'audit.exported',
      resourceType: 'audit',
      resourceId: id,
      outcome: AuditOutcome.Success,
      metadata: { format: 'csv', rowCount: rows.length },
    });

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    });
    res.send(toAuditCsv(rows));
  }
}
