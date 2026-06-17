import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import Handlebars from 'handlebars';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateToken } from '@/utils/genToken';
import { getManyResponse } from '@/utils/getManyResponse';
import { StorageService } from '@/modules/storage/storage.service';
import { GetManyReportsQueryDto } from './dto/reports.dto';
import { Report } from './entities/report.entity';
import type { ReportData } from './types/report-data.type';
import type { VulnerabilityReportData } from './types/vulnerability-report-data.type';
import { VulnerabilityReportService } from './services/vulnerability-report.service';
import { SummaryReportService } from './services/summary-report.service';

@Injectable()
export class ReportsService {
  private readonly templatePath: string;
  private readonly vulnerabilityTemplatePath: string;
  private readonly logoPath: string;
  private handlebarsTemplate: ReturnType<typeof Handlebars.compile> | null =
    null;
  private vulnerabilityTemplate: ReturnType<typeof Handlebars.compile> | null =
    null;
  private logoBase64: string | null = null;

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly storageService: StorageService,
    private readonly vulnerabilityReportService: VulnerabilityReportService,
    private readonly summaryReportService: SummaryReportService,
  ) {
    // __dirname resolves to src/modules/reports in dev, dist/modules/reports in production
    this.templatePath = path.join(__dirname, 'templates', 'report.hbs');
    this.vulnerabilityTemplatePath = path.join(
      __dirname,
      'templates',
      'vulnerability-report.hbs',
    );
    this.logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
    this.loadLogo();
    this.compileTemplates();
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
    const { limit, page, sortBy, sortOrder, search } = query;
    const offset = (page - 1) * limit;

    const qb = this.reportRepo
      .createQueryBuilder('report')
      .where('report.workspaceId = :workspaceId', { workspaceId });

    if (search) {
      qb.andWhere('report.fileName ILIKE :search', {
        search: `%${search}%`,
      });
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
    const data = await qb.limit(limit).offset(offset).getMany();

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

  private compileTemplates(): void {
    try {
      if (!fs.existsSync(this.templatePath)) {
        return;
      }
      const templateContent = fs.readFileSync(this.templatePath, 'utf-8');

      Handlebars.registerHelper('percentage', (value: number, max: number) => {
        return ((value / max) * 100).toFixed(1) + '%';
      });

      Handlebars.registerHelper('toUpper', (str: string) => str.toUpperCase());

      Handlebars.registerHelper('toLowerCase', (str: string) =>
        str.toLowerCase(),
      );

      Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

      Handlebars.registerHelper('concat', (...args: unknown[]) => {
        return args.slice(0, -1).join('');
      });

      Handlebars.registerHelper('riskBg', (level: string) => {
        const colors: Record<string, string> = {
          critical: '#fef2f2',
          high: '#fff7ed',
          medium: '#fefce8',
          low: '#f0fdf4',
        };
        return colors[level] || colors.low;
      });

      Handlebars.registerHelper('riskBadgeClass', (level: string) => {
        const classes: Record<string, string> = {
          critical: 'bg-red-100 text-red-700',
          high: 'bg-orange-100 text-orange-700',
          medium: 'bg-yellow-100 text-yellow-700',
          low: 'bg-green-100 text-green-700',
        };
        return classes[level] || classes.low;
      });

      Handlebars.registerHelper('riskTextClass', (level: string) => {
        const classes: Record<string, string> = {
          critical: 'text-red-600 bg-red-50',
          high: 'text-orange-600 bg-orange-50',
          medium: 'text-yellow-600 bg-yellow-50',
          low: 'text-green-600 bg-green-50',
        };
        return classes[level] || classes.low;
      });

      Handlebars.registerHelper('severityClass', (severity: string) => {
        const classes: Record<string, string> = {
          critical: 'bg-red-100 text-red-700 border-red-300',
          high: 'bg-orange-100 text-orange-700 border-orange-300',
          medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
          low: 'bg-blue-100 text-blue-700 border-blue-300',
          info: 'bg-slate-100 text-slate-700 border-slate-300',
        };
        return classes[severity] || classes.low;
      });

      Handlebars.registerHelper('statusClass', (status: string) => {
        const classes: Record<string, string> = {
          not_analyzed: 'bg-slate-100 text-slate-700 border-slate-300',
          running: 'bg-yellow-100 text-yellow-700 border-yellow-300',
          done: 'bg-green-100 text-green-700 border-green-300',
          failed: 'bg-red-100 text-red-700 border-red-300',
          pending: 'bg-slate-100 text-slate-600 border-slate-300',
          in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
          completed: 'bg-green-100 text-green-700 border-green-300',
        };
        return classes[status] || classes.pending;
      });

      Handlebars.registerHelper('severityBg', (severity: string) => {
        const colors: Record<string, string> = {
          critical: '#fef2f2',
          high: '#fff7ed',
          medium: '#fefce8',
          low: '#eff6ff',
          info: '#f1f5f9',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('severityColor', (severity: string) => {
        const colors: Record<string, string> = {
          critical: '#b91c1c',
          high: '#c2410c',
          medium: '#a16207',
          low: '#1d4ed8',
          info: '#475569',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('severityBorder', (severity: string) => {
        const colors: Record<string, string> = {
          critical: '#fca5a5',
          high: '#fdba74',
          medium: '#fde047',
          low: '#93c5fd',
          info: '#cbd5e1',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('statusBg', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#f1f5f9',
          running: '#fef9c3',
          done: '#dcfce7',
          failed: '#fef2f2',
          pending: '#f1f5f9',
          in_progress: '#dbeafe',
          completed: '#dcfce7',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusColor', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#475569',
          running: '#a16207',
          done: '#15803d',
          failed: '#b91c1c',
          pending: '#475569',
          in_progress: '#1d4ed8',
          completed: '#15803d',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusBorder', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#cbd5e1',
          running: '#fde047',
          done: '#86efac',
          failed: '#fca5a5',
          pending: '#cbd5e1',
          in_progress: '#93c5fd',
          completed: '#86efac',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusLabel', (status: string) => {
        const labels: Record<string, string> = {
          not_analyzed: 'Not Analyzed',
          running: 'Analyzing',
          done: 'Analyzed',
          failed: 'Failed',
          pending: 'Pending',
          in_progress: 'In Progress',
          completed: 'Completed',
        };
        return labels[status] || status;
      });

      Handlebars.registerHelper('gt', (a: number, b: number) => {
        return a > b;
      });

      Handlebars.registerHelper('sub', (a: number, b: number) => {
        return a - b;
      });

      Handlebars.registerHelper('join', (arr: string[], separator: string) => {
        if (!Array.isArray(arr)) return '';
        return arr.join(separator);
      });

      Handlebars.registerHelper('severityImpact', (severity: string) => {
        const impacts: Record<string, string> = {
          CRITICAL:
            'This vulnerability poses an immediate and severe risk to the affected system. Successful exploitation could lead to complete system compromise, unauthorized access to sensitive data, or full control over the affected infrastructure.',
          HIGH: 'This vulnerability presents a significant security risk. Exploitation could result in substantial data exposure, privilege escalation, or partial system compromise requiring immediate attention.',
          MEDIUM:
            'This vulnerability represents a moderate security concern. While exploitation may require specific conditions or combined attack vectors, it could lead to limited data access or system information disclosure.',
          LOW: 'This vulnerability presents a lower-tier security risk. Exploitation typically requires favorable conditions and may result in limited impact to system confidentiality, integrity, or availability.',
          INFO: 'This is an informational finding. It does not represent a direct security vulnerability but may provide useful context for security assessments.',
        };
        return impacts[severity] || impacts.LOW;
      });

      Handlebars.registerHelper(
        'formatDate',
        (dateStr: string | Date | null) => {
          if (!dateStr) return '-';
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return '-';
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        },
      );

      this.handlebarsTemplate = Handlebars.compile<ReportData>(templateContent);
    } catch {
      // ignore
    }

    try {
      if (!fs.existsSync(this.vulnerabilityTemplatePath)) {
        return;
      }

      const partialsDir = path.join(
        __dirname,
        'templates',
        'partials',
      );
      if (fs.existsSync(partialsDir)) {
        const partialFiles = fs.readdirSync(partialsDir);
        for (const file of partialFiles) {
          if (file.endsWith('.hbs')) {
            const partialName = file.replace('.hbs', '');
            const partialContent = fs.readFileSync(
              path.join(partialsDir, file),
              'utf-8',
            );
            Handlebars.registerPartial(partialName, partialContent);
          }
        }
      }

      const vulnTemplateContent = fs.readFileSync(
        this.vulnerabilityTemplatePath,
        'utf-8',
      );
      this.vulnerabilityTemplate =
        Handlebars.compile<VulnerabilityReportData>(vulnTemplateContent);
    } catch {
      // ignore
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
    let html: string;
    let data: ReportData | VulnerabilityReportData;

    if (type === 'VULNERABILITY') {
      data = await this.vulnerabilityReportService.getVulnerabilityReportData(
        workspaceId,
        options,
      );
      html = this.renderVulnerabilityTemplate(data);
    } else {
      data = await this.summaryReportService.getSummaryReportData(
        workspaceId,
        options,
      );
      html = this.renderTemplate(data);
    }

    const pdfBuffer = await this.htmlToPdf(html);

    const weekPad =
      'weekPad' in data
        ? (data as VulnerabilityReportData).weekPad
        : String((data as ReportData).week).padStart(2, '0');
    const year = data.year;

    const fileName = `report-${type.toLowerCase()}-${year}-W${weekPad}-${generateToken(5)}-${Date.now()}.pdf`;
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

  private renderTemplate(data: ReportData): string {
    if (!this.handlebarsTemplate) {
      throw new Error('Template not compiled');
    }
    return this.handlebarsTemplate({ ...data, logoBase64: this.logoBase64 });
  }

  private renderVulnerabilityTemplate(data: VulnerabilityReportData): string {
    if (!this.vulnerabilityTemplate) {
      throw new Error('Vulnerability template not compiled');
    }
    return this.vulnerabilityTemplate({
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

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto(`data:text/html,${encodeURIComponent(html)}`, {
        waitUntil: 'networkidle0',
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const logoSrc = this.logoBase64 || '';

      const headerTemplate = `
        <div style="width: 100%; padding: 8px 40px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; font-family: Arial, Helvetica, sans-serif;">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="height: 28px; width: auto;" />` : '<div style="width: 28px; height: 28px; background: #dc2626; border-radius: 5px; display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 13px;">O</span></div>'}
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 1px; font-size: 12px; color: #64748b;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #dc2626;">&#9679;</span>
              <span>https://github.com/oasm-platform/open-asm</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: #dc2626;">&#11088;</span>
              <span>https://www.linkedin.com/company/oasm-platform</span>
            </div>
          </div>
        </div>`;

      const footerTemplate = `
        <div style="width: 100%; padding: 6px 40px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #64748b;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 14px; height: 14px; background: #dc2626; border-radius: 3px; display: flex; align-items: center; justify-content: center;">
              <span style="color: white; font-weight: bold; font-size: 7px;">&#9650;</span>
            </div>
            <span style="font-weight: 600; color: #334155;">OASM Team</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="color: #94a3b8;">Strictly Confidential</span>
            <span style="color: #94a3b8;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        </div>`;

      const commonOptions = {
        format: 'A4' as const,
        printBackground: true,
      };

      const page1Buffer = await page.pdf({
        ...commonOptions,
        displayHeaderFooter: false,
        pageRanges: '1',
        margin: {
          top: '0mm',
          bottom: '0mm',
          left: '0mm',
          right: '0mm',
        },
      });

      const remainingPagesBuffer = await page.pdf({
        ...commonOptions,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        pageRanges: '2-',
        margin: {
          top: '40px',
          bottom: '40px',
          left: '0mm',
          right: '0mm',
        },
      });

      const coverDoc = await PDFDocument.load(page1Buffer);
      const mainDoc = await PDFDocument.load(remainingPagesBuffer);
      const mergedPdf = await PDFDocument.create();

      const [coverPage] = await mergedPdf.copyPages(coverDoc, [0]);
      mergedPdf.addPage(coverPage);

      for (let i = 0; i < mainDoc.getPageCount(); i++) {
        const [mainPage] = await mergedPdf.copyPages(mainDoc, [i]);
        mergedPdf.addPage(mainPage);
      }

      const mergedBuffer = await mergedPdf.save();
      return Buffer.from(mergedBuffer);
    } finally {
      await browser.close();
    }
  }

}
