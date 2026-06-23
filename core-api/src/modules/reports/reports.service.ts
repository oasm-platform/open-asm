import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { STORAGE_BASE_PATH } from '@/common/constants/app.constants';
import { generateToken } from '@/utils/genToken';
import { getManyResponse } from '@/utils/getManyResponse';
import { StorageService } from '@/modules/storage/storage.service';
import { GetManyReportsQueryDto } from './dto/reports.dto';
import { Report } from './entities/report.entity';
import type { ReportData } from './types/report-data.type';
import type { VulnerabilityReportData } from './types/vulnerability-report-data.type';
import { VulnerabilityReportService } from './services/vulnerability-report.service';
import { SummaryReportService } from './services/summary-report.service';
import { renderReportPdf } from './renderer/pdf-renderer';

@Injectable()
export class ReportsService {
  private readonly logoPath: string;
  private logoBase64: string | null = null;

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly storageService: StorageService,
    private readonly vulnerabilityReportService: VulnerabilityReportService,
    private readonly summaryReportService: SummaryReportService,
  ) {
    this.logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
    this.loadLogo();
  }

  async findById(id: string, workspaceId: string): Promise<Report> {
    const report = await this.reportRepo.findOne({
      where: { id, workspace: { id: workspaceId } },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
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

    const data = reports.map((report) => {
      const idx = report.path.indexOf('/');
      const bucket = report.path.slice(0, idx);
      const filePath = report.path.slice(idx + 1);
      const token = this.storageService.generateDownloadToken(filePath, bucket);
      const downloadUrl = `${STORAGE_BASE_PATH}/${bucket}/${encodeURIComponent(filePath)}/download?token=${token}`;
      return { ...report, downloadUrl };
    });

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
    workspaceId: string,
    userId: string,
    type: 'SUMMARY' | 'VULNERABILITY' = 'SUMMARY',
    options?: {
      startDate?: Date;
      endDate?: Date;
      targetIds?: string[];
      vulnIds?: string[];
      minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    },
  ): Promise<{ filePath: string; fileName: string }> {
    let data: ReportData | VulnerabilityReportData;

    if (type === 'VULNERABILITY') {
      data = await this.vulnerabilityReportService.getVulnerabilityReportData(
        workspaceId,
        options,
      );
    } else {
      data = await this.summaryReportService.getSummaryReportData(
        workspaceId,
        options,
      );
    }

    const enrichedData = {
      ...data,
      logoBase64: this.logoBase64 ?? data.logoBase64,
    };

    const pdfBuffer = await renderReportPdf(type, enrichedData);

    const fileName = `report-${type.toLowerCase()}-${generateToken(24)}-${Date.now()}.pdf`;
    const { path: uploadPath } = await this.storageService.uploadFile(
      fileName,
      pdfBuffer,
      'reports',
    );

    await this.reportRepo.save({
      workspace: { id: workspaceId },
      user: { id: userId },
      type,
      path: uploadPath,
      fileName,
    });

    return { filePath: uploadPath, fileName };
  }

  async previewSummaryReport(
    workspaceId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      targetIds?: string[];
    },
  ): Promise<Buffer> {
    const data = await this.summaryReportService.getSummaryReportData(
      workspaceId,
      {
        startDate: options?.startDate ? new Date(options.startDate) : undefined,
        endDate: options?.endDate ? new Date(options.endDate) : undefined,
        targetIds: options?.targetIds,
      },
    );
    return renderReportPdf('SUMMARY', {
      ...data,
      logoBase64: this.logoBase64 ?? data.logoBase64,
    });
  }

  async previewVulnerabilityReport(
    workspaceId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      targetIds?: string[];
      vulnIds?: string[];
      minSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    },
  ): Promise<Buffer> {
    const data = await this.vulnerabilityReportService.getVulnerabilityReportData(
      workspaceId,
      {
        startDate: options?.startDate ? new Date(options.startDate) : undefined,
        endDate: options?.endDate ? new Date(options.endDate) : undefined,
        targetIds: options?.targetIds,
        vulnIds: options?.vulnIds,
        minSeverity: options?.minSeverity,
      },
    );
    return renderReportPdf('VULNERABILITY', {
      ...data,
      logoBase64: this.logoBase64 ?? data.logoBase64,
    });
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
