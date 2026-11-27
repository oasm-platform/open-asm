import { HttpException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArtifactSource, AuditActorType, AuditOutcome, BullMQName } from '@/common/enums/enum';
import { firstMissingPermission } from '@/common/utils/permission-keys.util';
import { isNotFound } from '@/common/errors/error-checks';
import { ArtifactFoldersService } from '@/modules/artifacts/artifact-folders.service';
import {
  ARTIFACTS_BUCKET,
  ArtifactsService,
  REPORTS_FOLDER_NAME,
  toObjectKey,
} from '@/modules/artifacts/artifacts.service';
import { EVENT_CATALOG } from '@/modules/event-bridge/contracts/event-catalog';
import { EventBridgeService } from '@/modules/event-bridge/publishing/event-bridge.service';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { StorageService } from '@/modules/storage/storage.service';
import type { CreateReportScheduleDto, GetManyReportsQueryDto } from './dto/reports.dto';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Report } from './entities/report.entity';
import { reportFileName } from './report-file-name';
import { ReportRunner } from './report-runner';
import { renderTemplatePdf } from './templates/render';
import { BUILTIN_TEMPLATES } from './templates/registry';
import type { ReportOptions } from './templates/shared/asq-filters';
import type { BuiltinTemplate } from './templates/template.types';
import { AsqSavedQueriesService } from '@/modules/attack-surface-query/asq-saved-queries.service';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { AsqError } from '@/modules/attack-surface-query/domain/query-errors';
import { DomainError, ForbiddenError, NotFoundError } from '@/common/errors/domain.errors';

/** Filters as they arrive on the preview query string. */
interface PreviewOptions extends Omit<ReportOptions, 'startDate' | 'endDate'> {
  startDate?: string;
  endDate?: string;
}

function toReportOptions(options: PreviewOptions = {}): ReportOptions {
  return {
    ...options,
    startDate: options.startDate ? new Date(options.startDate) : undefined,
    endDate: options.endDate ? new Date(options.endDate) : undefined,
  };
}

type BuiltinType = 'SUMMARY' | 'VULNERABILITY';

/** Payload of a REPORT_GENERATE job: the member as they were when they asked. */
export interface ReportJob {
  workspaceId: string;
  userId: string;
  permissions: string[];
  type: BuiltinType | 'QUERY';
  options?: PreviewOptions;
  savedQueryId?: string;
  scheduled?: boolean;
}

export interface ReportScheduleJob {
  scheduleId: string;
}

const schedulerId = (scheduleId: string) => `report-schedule:${scheduleId}`;

/** What the requester may read in the failure notification: our own refusals, never a raw DB or S3 error. */
function userFacingError(e: unknown): string {
  if (e instanceof DomainError || e instanceof AsqError) return e.message;
  if (e instanceof HttpException && e.getStatus() < 500) return e.message;
  return 'Report generation failed';
}

@Injectable()
export class ReportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportsService.name);
  private readonly logoPath: string;
  private logoBase64: string | null = null;

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepo: Repository<ReportSchedule>,
    private readonly storageService: StorageService,
    private readonly artifacts: ArtifactsService,
    private readonly folders: ArtifactFoldersService,
    private readonly runner: ReportRunner,
    private readonly savedQueries: AsqSavedQueriesService,
    private readonly workspaces: WorkspacesService,
    private readonly eventBridge: EventBridgeService,
    @InjectQueue(BullMQName.REPORT_GENERATE)
    private readonly generateQueue: Queue<ReportJob>,
    @InjectQueue(BullMQName.REPORT_SCHEDULE)
    private readonly scheduleQueue: Queue<ReportScheduleJob>,
  ) {
    this.logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
    this.loadLogo();
  }

  async findById(id: string, workspaceId: string): Promise<Report> {
    const report = await this.reportRepo.findOne({
      where: { id, workspace: { id: workspaceId } },
    });
    if (!report) {
      throw new NotFoundError('Report not found');
    }
    return report;
  }

  async getMany(query: GetManyReportsQueryDto, workspaceId: string) {
    const { limit, page, sortBy, sortOrder, search, type } = query;
    const offset = (page - 1) * limit;

    const qb = this.reportRepo
      .createQueryBuilder('report')
      .where('report.workspaceId = :workspaceId', { workspaceId });

    if (search) {
      qb.andWhere('report.fileName ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (type) {
      qb.andWhere('report.type = :type', { type });
    }

    const allowedSortColumns = [
      'id',
      'createdAt',
      'updatedAt',
      'fileName',
      'userId',
    ];
    const sortColumn = allowedSortColumns.includes(sortBy)
      ? `report.${sortBy}`
      : 'report.createdAt';
    qb.orderBy(sortColumn, sortOrder);

    const total = await qb.getCount();
    const reports = await qb.limit(limit).offset(offset).getMany();

    const data = await Promise.all(
      reports.map(async (report) => {
        const idx = report.path.indexOf('/');
        const bucket = report.path.slice(0, idx);
        const filePath = report.path.slice(idx + 1);
        const { url: downloadUrl, expiresIn } =
          await this.storageService.getPresignedDownloadUrl({
            bucket,
            key: filePath,
            fileName: report.fileName,
            contentType: 'application/pdf',
          });
        return { ...report, downloadUrl, downloadExpiresIn: expiresIn };
      }),
    );

    return getManyResponse({ query, data, total });
  }

  private loadLogo(): void {
    try {
      if (fs.existsSync(this.logoPath)) {
        const logoBuffer = fs.readFileSync(this.logoPath);
        this.logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    } catch {
      // ignore — logo is optional
    }
  }

  /** Validates as the caller now (403/400 in the request), then queues the render. */
  async enqueueReport(scope: QueryScope, userId: string, type: BuiltinType, options: PreviewOptions = {}): Promise<void> {
    this.validateBuiltin(type, scope, toReportOptions(options));
    await this.generateQueue.add(type, { workspaceId: scope.workspaceId, userId, permissions: [...scope.permissions], type, options });
  }

  async enqueueQueryReport(scope: QueryScope, userId: string, savedQueryId: string): Promise<void> {
    const saved = await this.savedQueries.get(scope.workspaceId, savedQueryId);
    this.runner.validate(BUILTIN_TEMPLATES.query, scope, { spec: saved.spec, title: saved.name, description: saved.description });
    await this.generateQueue.add('QUERY', { workspaceId: scope.workspaceId, userId, permissions: [...scope.permissions], type: 'QUERY', savedQueryId });
  }

  /** Renders and stores one queued report, then tells its user. Never throws: a retry would reuse stale permissions. */
  async runJob(job: ReportJob): Promise<void> {
    const scope: QueryScope = { workspaceId: job.workspaceId, permissions: job.permissions, caller: 'report' };
    let fileName: string | undefined;
    let error: string | undefined;
    try {
      if (firstMissingPermission(job.permissions, ['report.write']) !== null) {
        throw new ForbiddenError('Requires report.write');
      }
      ({ fileName } =
        job.type === 'QUERY'
          ? await this.generateQueryReport(scope, job.userId, job.savedQueryId ?? '')
          : await this.generateReport(scope, job.userId, job.type, toReportOptions(job.options)));
    } catch (e) {
      error = userFacingError(e);
      this.logger.warn(`Report ${job.type} for workspace ${job.workspaceId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    await this.eventBridge.publishSafely(EVENT_CATALOG.report.completed, {
      workspaceId: job.workspaceId,
      actor: job.scheduled ? { type: AuditActorType.System } : { type: AuditActorType.User, id: job.userId },
      outcome: error ? AuditOutcome.Failure : AuditOutcome.Success,
      resourceType: 'report',
      payload: { userId: job.userId, reportType: job.type, fileName, error },
    });
  }

  /** Fires a schedule with its owner's permissions as they are now. */
  async runSchedule(scheduleId: string, repeatJobKey?: string): Promise<void> {
    const schedule = await this.scheduleRepo.findOneBy({ id: scheduleId });
    let permissions: string[] | undefined;
    if (schedule) {
      try {
        ({ permissionKeys: permissions } = await this.workspaces.getMembershipWithPermissions(
          schedule.workspaceId,
          schedule.userId,
        ));
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }
    if (!schedule || !permissions) {
      // The schedule went with its workspace, or its owner left: nobody to run it for.
      this.logger.warn(`Report schedule ${scheduleId} no longer resolves, removing it`);
      await this.scheduleQueue.removeJobScheduler(repeatJobKey ?? schedulerId(scheduleId));
      if (schedule) await this.scheduleRepo.delete(schedule.id);
      return;
    }
    await this.runJob({
      workspaceId: schedule.workspaceId,
      userId: schedule.userId,
      permissions,
      type: schedule.type,
      options: schedule.options,
      scheduled: true,
    });
  }

  listSchedules(workspaceId: string): Promise<ReportSchedule[]> {
    return this.scheduleRepo.find({ where: { workspaceId }, order: { createdAt: 'DESC' } });
  }

  async createSchedule(scope: QueryScope, userId: string, dto: CreateReportScheduleDto): Promise<ReportSchedule> {
    const options = { targetIds: dto.targetIds, minSeverity: dto.minSeverity };
    this.validateBuiltin(dto.type, scope, options);
    const schedule = await this.scheduleRepo.save(
      this.scheduleRepo.create({ workspaceId: scope.workspaceId, userId, type: dto.type, cron: dto.cron, options }),
    );
    try {
      await this.register(schedule);
    } catch (error) {
      // A row without a scheduler would be listed but never run.
      await this.scheduleRepo.delete(schedule.id);
      throw error;
    }
    return schedule;
  }

  /**
   * Re-registers every schedule and drops schedulers whose row is gone, so lost Redis data
   * cannot stop schedules silently. Schedulers are listed before rows are read: a schedule
   * created meanwhile (row saved before its scheduler) is never taken for an orphan.
   */
  async reconcileSchedules(): Promise<{ registered: number; removed: number }> {
    const existing = await this.scheduleQueue.getJobSchedulers(0, -1);
    const schedules = await this.scheduleRepo.find();
    for (const schedule of schedules) await this.register(schedule);
    const wanted = new Set(schedules.map((s) => schedulerId(s.id)));
    let removed = 0;
    for (const { key } of existing) {
      if (wanted.has(key)) continue;
      await this.scheduleQueue.removeJobScheduler(key);
      removed++;
    }
    return { registered: schedules.length, removed };
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const { registered, removed } = await this.reconcileSchedules();
      this.logger.log(`Report schedules: ${registered} registered, ${removed} orphaned scheduler(s) removed`);
    } catch (error) {
      // Best effort: a broken Redis must not stop the API from booting.
      this.logger.warn(`Report schedules not reconciled: ${(error as Error).message}`);
    }
  }

  private async register(schedule: ReportSchedule): Promise<void> {
    await this.scheduleQueue.upsertJobScheduler(
      schedulerId(schedule.id),
      { pattern: schedule.cron },
      { name: schedule.id, data: { scheduleId: schedule.id } },
    );
  }

  async deleteSchedule(id: string, workspaceId: string): Promise<void> {
    const schedule = await this.scheduleRepo.findOneBy({ id, workspaceId });
    if (!schedule) throw new NotFoundError('Report schedule not found');
    await this.scheduleQueue.removeJobScheduler(schedulerId(id));
    await this.scheduleRepo.delete(id);
  }

  async generateReport(
    scope: QueryScope,
    userId: string,
    type: 'SUMMARY' | 'VULNERABILITY' = 'SUMMARY',
    options: ReportOptions = {},
  ): Promise<{ filePath: string; fileName: string }> {
    const pdfBuffer = await (type === 'VULNERABILITY'
      ? this.render(BUILTIN_TEMPLATES.vulnerability, scope, options)
      : this.render(BUILTIN_TEMPLATES.summary, scope, options));
    return this.store(scope.workspaceId, userId, type, pdfBuffer);
  }

  /** Renders a saved attack surface query as a PDF (one table per query), run as the caller. */
  async generateQueryReport(
    scope: QueryScope,
    userId: string,
    savedQueryId: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const saved = await this.savedQueries.get(scope.workspaceId, savedQueryId);
    const pdfBuffer = await this.render(BUILTIN_TEMPLATES.query, scope, {
      spec: saved.spec,
      title: saved.name,
      description: saved.description,
    });
    return this.store(scope.workspaceId, userId, 'QUERY', pdfBuffer, saved.name);
  }

  previewSummaryReport(scope: QueryScope, options?: PreviewOptions): Promise<Buffer> {
    return this.render(BUILTIN_TEMPLATES.summary, scope, toReportOptions(options));
  }

  previewVulnerabilityReport(scope: QueryScope, options?: PreviewOptions): Promise<Buffer> {
    return this.render(BUILTIN_TEMPLATES.vulnerability, scope, toReportOptions(options));
  }

  private validateBuiltin(type: BuiltinType, scope: QueryScope, options: ReportOptions): void {
    if (type === 'VULNERABILITY') this.runner.validate(BUILTIN_TEMPLATES.vulnerability, scope, options);
    else this.runner.validate(BUILTIN_TEMPLATES.summary, scope, options);
  }

  private async render<O, D>(template: BuiltinTemplate<O, D>, scope: QueryScope, options: O): Promise<Buffer> {
    const data = await this.runner.run(template, scope, options);
    return renderTemplatePdf(template, { ...data, logoBase64: this.logoBase64 ?? undefined });
  }

  private async store(
    workspaceId: string,
    userId: string,
    type: 'SUMMARY' | 'VULNERABILITY' | 'QUERY',
    pdfBuffer: Buffer,
    title?: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const [workspace] = await this.workspaces.getWorkspacesByIds([workspaceId]);
    const fileName = reportFileName({ workspaceName: workspace?.name ?? '', type, title, now: new Date() });
    // As a workspace file the PDF counts against the storage quota (409 when full).
    const folder = await this.folders.ensureWorkspaceFolder(workspaceId, REPORTS_FOLDER_NAME);
    const artifact = await this.artifacts.createFromBuffer({
      workspaceId,
      userId,
      source: ArtifactSource.REPORT,
      name: fileName,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      parentFolderId: folder.id,
      actorType: AuditActorType.User,
    });
    const uploadPath = `${ARTIFACTS_BUCKET}/${toObjectKey(workspaceId, artifact.id, fileName)}`;
    try {
      await this.reportRepo.save({
        workspace: { id: workspaceId },
        user: { id: userId },
        type,
        path: uploadPath,
        fileName,
        artifactId: artifact.id,
      });
    } catch (error) {
      await this.artifacts.deleteServerFile(artifact.id);
      throw error;
    }
    return { filePath: uploadPath, fileName };
  }

  async deleteReport(id: string, workspaceId: string): Promise<void> {
    const report = await this.findById(id, workspaceId);
    if (report.artifactId) {
      // Frees the quota; the report row goes with the artifact (FK cascade).
      await this.artifacts.deleteServerFile(report.artifactId);
      await this.reportRepo.delete(report.id);
      return;
    }

    try {
      const idx = report.path.indexOf('/');
      const bucket = report.path.slice(0, idx);
      const filePath = report.path.slice(idx + 1);
      await this.storageService.deleteFile(filePath, bucket);
    } catch {
      // File may not exist, ignore
    }

    await this.reportRepo.remove(report);
  }
}
