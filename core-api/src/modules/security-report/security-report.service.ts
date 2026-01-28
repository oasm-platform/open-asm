import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SecurityReport,
  ReportStatus,
} from './entities/security-report.entity';
import { CreateReportDto, UpdateReportDto } from './dto/security-report.dto';
import { User } from '../auth/entities/user.entity';
import * as puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Vulnerability } from '../vulnerabilities/entities/vulnerability.entity';
import { VulnerabilityDismissal } from '../vulnerabilities/entities/vulnerability-dismissal.entity';
import { ReportRole } from './entities/security-report.entity';
import {
  ReportContent,
  DeveloperVulnerability,
} from './interfaces/report-content.interface';

@Injectable()
export class SecurityReportService {
  constructor(
    @InjectRepository(SecurityReport)
    private readonly reportRepository: Repository<SecurityReport>,
    @InjectRepository(Vulnerability)
    private readonly vulnerabilityRepository: Repository<Vulnerability>,
    @InjectRepository(VulnerabilityDismissal)
    private readonly dismissalRepository: Repository<VulnerabilityDismissal>,
  ) {
    this.registerHandlebarsHelpers();
  }

  private registerHandlebarsHelpers() {
    handlebars.registerHelper(
      'eq',
      (a: unknown, b: unknown): boolean => a === b,
    );
    handlebars.registerHelper('add', (a: number, b: number): number => a + b);
    handlebars.registerHelper(
      'json',
      (obj: unknown): string => JSON.stringify(obj) || '',
    );
    handlebars.registerHelper('concat', (...args) =>
      args.slice(0, -1).join(''),
    );
    handlebars.registerHelper(
      'hbsInput',
      (_: unknown, value: unknown): string => (value as string) || '',
    );
    handlebars.registerHelper(
      'hbsTextarea',
      (_: unknown, value: unknown): string => (value as string) || '',
    );
    handlebars.registerHelper('severityColorClass', (severity: string) => {
      switch (severity?.toUpperCase()) {
        case 'CRITICAL':
          return 'bg-red-600';
        case 'HIGH':
          return 'bg-orange-500';
        case 'MEDIUM':
          return 'bg-yellow-500';
        case 'LOW':
          return 'bg-green-500';
        default:
          return 'bg-slate-400';
      }
    });
  }

  async create(
    createDto: CreateReportDto,
    user: User,
  ): Promise<SecurityReport> {
    const report = this.reportRepository.create({
      ...createDto,
      creatorId: user.id,
    });
    return await this.reportRepository.save(report);
  }

  async generatePreview(
    dto: CreateReportDto,
    user: User,
  ): Promise<SecurityReport> {
    const { workspaceId, targetRole } = dto;

    // Fetch open vulnerabilities for the workspace
    const vulnerabilities = await this.vulnerabilityRepository
      .createQueryBuilder('v')
      .leftJoin('v.asset', 'a')
      .leftJoin('a.target', 't')
      .leftJoin('t.workspaceTargets', 'wt')
      .leftJoin('wt.workspace', 'w')
      .leftJoin('v.vulnerabilityDismissal', 'vd')
      .where('w.id = :workspaceId', { workspaceId })
      .andWhere('vd.id IS NULL')
      .getMany();

    // Populate content based on role
    const content: ReportContent = {
      developer: {
        vulnerabilities: vulnerabilities.map(
          (v): DeveloperVulnerability => ({
            name: v.name,
            description: v.description,
            severity: v.severity,
            category: v.tags?.[0] || 'Uncategorized',
            endpoint: v.affectedUrl || v.host || 'N/A',
            reproduce: 'To be investigated',
            evidence: v.extractedResults?.[0] || 'N/A',
            rootCause: 'To be investigated',
            fix: v.solution || 'Follow security best practices',
          }),
        ),
      },
    };

    // Calculate charts data
    const severityCounts = vulnerabilities.reduce(
      (acc, v) => {
        const s = v.severity?.toUpperCase() || 'LOW';
        if (s === 'CRITICAL') acc.critical++;
        else if (s === 'HIGH') acc.high++;
        else if (s === 'MEDIUM') acc.medium++;
        else if (s === 'LOW') acc.low++;
        else acc.info++;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    );

    const categoryCountsMap = vulnerabilities.reduce(
      (acc: Record<string, number>, v) => {
        const cat = v.tags?.[0] || 'Uncategorized';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      },
      {},
    );

    content.charts = {
      severityDistribution: severityCounts,
      categoryBreakdown: Object.entries(categoryCountsMap).map(
        ([name, count]) => ({ name, count }),
      ),
    };

    // Aggregate some executive summary if needed
    if (targetRole === ReportRole.EXECUTIVE) {
      content.executive = {
        summary: `This report provides a security overview for workspace. Found ${vulnerabilities.length} open vulnerabilities.`,
        riskRating:
          severityCounts.critical > 0
            ? 'Critical'
            : severityCounts.high > 0
              ? 'High'
              : 'Medium',
        top3Risks: vulnerabilities.slice(0, 3).map((v) => ({
          name: v.name,
          description: v.description,
          impact: 'High',
        })),
        businessImpact: 'Significant if left unaddressed.',
        actionPlan: 'Remediate critical and high vulnerabilities immediately.',
      };
    }

    const report = this.reportRepository.create({
      ...dto,
      content: content,
      creatorId: user.id,
      status: ReportStatus.DRAFT,
    });

    return report;
  }

  async findAll(workspaceId: string): Promise<SecurityReport[]> {
    return await this.reportRepository.find({
      where: { workspaceId },
      relations: ['creator', 'workspace'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SecurityReport> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return report;
  }

  async update(
    id: string,
    updateDto: UpdateReportDto,
  ): Promise<SecurityReport> {
    const report = await this.findOne(id);
    Object.assign(report, updateDto);
    return await this.reportRepository.save(report);
  }

  async remove(id: string): Promise<void> {
    const report = await this.findOne(id);
    await this.reportRepository.remove(report);
  }

  async generatePdf(id: string): Promise<Buffer> {
    const report = await this.findOne(id);

    // Determine template based on target role
    let templateName = 'report.hbs';
    if (report.targetRole) {
      templateName = `report-${report.targetRole.toLowerCase()}.hbs`;
    }

    const templatePath = path.join(__dirname, 'templates', templateName);
    let templateHtml: string;
    try {
      templateHtml = await fs.readFile(templatePath, 'utf-8');
    } catch {
      // Fallback to default if role-specific template doesn't exist
      const defaultPath = path.join(__dirname, 'templates', 'report.hbs');
      templateHtml = await fs.readFile(defaultPath, 'utf-8');
    }

    const template = handlebars.compile(templateHtml);

    // Prepare data for template
    const vulnerabilities = report.content?.developer?.vulnerabilities || [];
    const severityCounts = vulnerabilities.reduce(
      (acc, v) => {
        const s = v.severity?.toUpperCase() || 'LOW';
        if (s === 'CRITICAL') acc.critical++;
        else if (s === 'HIGH') acc.high++;
        else if (s === 'MEDIUM') acc.medium++;
        else if (s === 'LOW') acc.low++;
        else acc.info++;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    );

    const categoryCountsMap = (
      report.content?.developer?.vulnerabilities || []
    ).reduce((acc: Record<string, number>, v) => {
      const cat = v.category || 'Other';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});
    const statusColorClass =
      report.status === ReportStatus.COMPLETED
        ? 'text-green-600 bg-green-50 border-green-200'
        : report.status === ReportStatus.ARCHIVED
          ? 'text-slate-500 bg-slate-100 border-slate-200'
          : 'text-amber-600 bg-amber-50 border-amber-200';

    // Heuristic mapping for Radar and Posture charts
    const radar = { app: 0, net: 0, id: 0, cloud: 0, sec: 0, sto: 0 };
    const posture = { net: 0, iso: 0, enc: 0, val: 0, pat: 0 };

    vulnerabilities.forEach((v) => {
      const text = (v.category + ' ' + v.name).toLowerCase();
      if (text.includes('app') || text.includes('web')) radar.app++;
      if (
        text.includes('net') ||
        text.includes('dns') ||
        text.includes('port')
      ) {
        radar.net++;
        posture.net++;
      }
      if (
        text.includes('auth') ||
        text.includes('user') ||
        text.includes('jwt')
      )
        radar.id++;
      if (
        text.includes('cloud') ||
        text.includes('aws') ||
        text.includes('s3')
      ) {
        radar.cloud++;
        posture.iso++;
      }
      if (
        text.includes('secret') ||
        text.includes('key') ||
        text.includes('leak')
      ) {
        radar.sec++;
        posture.val++;
      }
      if (text.includes('storage') || text.includes('db')) radar.sto++;
      if (
        text.includes('ssl') ||
        text.includes('tls') ||
        text.includes('crypto')
      )
        posture.enc++;
      if (
        text.includes('version') ||
        text.includes('outdated') ||
        text.includes('update')
      )
        posture.pat++;
    });

    const norm = (val: number) =>
      Math.min(100, Math.max(10, val * 15 + Math.floor(Math.random() * 20)));

    const data = {
      report,
      year: new Date().getFullYear(),
      formattedDate: new Date(report.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      statusColorClass,
      severityCounts,
      radarData: [
        norm(radar.app),
        norm(radar.net),
        norm(radar.id),
        norm(radar.cloud),
        norm(radar.sec),
        norm(radar.sto),
      ],
      postureData: [
        norm(posture.net),
        norm(posture.iso),
        norm(posture.enc),
        norm(posture.val),
        norm(posture.pat),
      ],
      executiveStats: {
        criticalHigh: severityCounts.critical + severityCounts.high,
        total: Object.values(severityCounts).reduce((a, b) => a + b, 0),
      },
      categoryCounts: {
        labels: Object.keys(categoryCountsMap),
        values: Object.values(categoryCountsMap),
      },
    };

    const html = template(data);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Give charts some time to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px',
      },
    });

    await browser.close();
    return Buffer.from(pdf);
  }
}
