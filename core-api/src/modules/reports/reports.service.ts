import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateToken } from '@/common/utils/gen-token.util';
import { getManyResponse } from '@/common/utils/get-many-response.util';
import { StorageService } from '@/modules/storage/storage.service';
import { GetManyReportsQueryDto } from './dto/reports.dto';
import { Report } from './entities/report.entity';
import { ReportRunner } from './report-runner';
import { renderTemplatePdf } from './templates/render';
import { BUILTIN_TEMPLATES } from './templates/registry';
import type { ReportOptions } from './templates/shared/asq-filters';
import type { BuiltinTemplate } from './templates/template.types';
import { AsqSavedQueriesService } from '@/modules/attack-surface-query/asq-saved-queries.service';
import type { QueryScope } from '@/modules/attack-surface-query/domain/query.types';
import { NotFoundError } from '@/common/errors/domain.errors';

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

@Injectable()
export class ReportsService {
  private readonly logoPath: string;
  private logoBase64: string | null = null;

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly storageService: StorageService,
    private readonly runner: ReportRunner,
    private readonly savedQueries: AsqSavedQueriesService,
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
    return this.store(scope.workspaceId, userId, 'QUERY', pdfBuffer);
  }

  previewSummaryReport(scope: QueryScope, options?: PreviewOptions): Promise<Buffer> {
    return this.render(BUILTIN_TEMPLATES.summary, scope, toReportOptions(options));
  }

  previewVulnerabilityReport(scope: QueryScope, options?: PreviewOptions): Promise<Buffer> {
    return this.render(BUILTIN_TEMPLATES.vulnerability, scope, toReportOptions(options));
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
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `report-${type.toLowerCase()}-${generateToken(24)}-${Date.now()}.pdf`;
    const { path: uploadPath } = await this.storageService.uploadFile(fileName, pdfBuffer, 'reports');
    await this.reportRepo.save({
      workspace: { id: workspaceId },
      user: { id: userId },
      type,
      path: uploadPath,
      fileName,
    });
    return { filePath: uploadPath, fileName };
  }

  async deleteReport(id: string, workspaceId: string): Promise<void> {
    const report = await this.findById(id, workspaceId);

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
