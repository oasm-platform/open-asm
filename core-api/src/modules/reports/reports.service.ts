import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import Handlebars from 'handlebars';

interface ReportData {
  reportTitle: string;
  week: number;
  year: number;
  exportedAt: string;
  classification: string;
  systemName: string;
  formattedDate: string;
  weekPad: string;
  systemNameChar: string;
  weekly: Record<string, number>;
  monthly: Record<string, number>;
  vulnerabilityTrends: Record<string, unknown>;
  newDiscoveries: Record<string, unknown[]>;
  newFindings: Record<string, unknown>[];
  resolvedFindings: Record<string, unknown>[];
  riskDistribution: Record<string, unknown>[];
  targets: Record<string, unknown>[];
  vulnerabilityByTarget: Record<string, unknown>[];
}

@Injectable()
export class ReportsService {
  private readonly storagePath: string;
  private readonly templatePath: string;
  private handlebarsTemplate: ReturnType<typeof Handlebars.compile> | null = null;

  constructor() {
    this.storagePath = path.join(process.cwd(), '.storage', 'reports');
    const srcDir = path.join(process.cwd(), 'src', 'modules', 'reports');
    this.templatePath = path.join(srcDir, 'templates', 'report.hbs');
    this.ensureStorageDirectory();
    this.compileTemplate();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private compileTemplate(): void {
    try {
      if (!fs.existsSync(this.templatePath)) {
        console.error('Template file not found:', this.templatePath);
        return;
      }
      const templateContent = fs.readFileSync(this.templatePath, 'utf-8');
      console.log('Template loaded, length:', templateContent.length);
      
      Handlebars.registerHelper('percentage', (value: number, max: number) => {
        return ((value / max) * 100).toFixed(1) + '%';
      });

      Handlebars.registerHelper('toUpper', (str: string) => str.toUpperCase());

      Handlebars.registerHelper('riskBg', (level: string) => {
        const colors: Record<string, string> = {
          critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4',
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
          critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#eff6ff', info: '#f1f5f9',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('severityColor', (severity: string) => {
        const colors: Record<string, string> = {
          critical: '#b91c1c', high: '#c2410c', medium: '#a16207', low: '#1d4ed8', info: '#475569',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('severityBorder', (severity: string) => {
        const colors: Record<string, string> = {
          critical: '#fca5a5', high: '#fdba74', medium: '#fde047', low: '#93c5fd', info: '#cbd5e1',
        };
        return colors[severity] || colors.low;
      });

      Handlebars.registerHelper('statusBg', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#f1f5f9', running: '#fef9c3', done: '#dcfce7', failed: '#fef2f2',
          pending: '#f1f5f9', in_progress: '#dbeafe', completed: '#dcfce7',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusColor', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#475569', running: '#a16207', done: '#15803d', failed: '#b91c1c',
          pending: '#475569', in_progress: '#1d4ed8', completed: '#15803d',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusBorder', (status: string) => {
        const colors: Record<string, string> = {
          not_analyzed: '#cbd5e1', running: '#fde047', done: '#86efac', failed: '#fca5a5',
          pending: '#cbd5e1', in_progress: '#93c5fd', completed: '#86efac',
        };
        return colors[status] || colors.pending;
      });

      Handlebars.registerHelper('statusLabel', (status: string) => {
        const labels: Record<string, string> = {
          not_analyzed: 'Not Analyzed', running: 'Analyzing', done: 'Analyzed', failed: 'Failed',
          pending: 'Pending', in_progress: 'In Progress', completed: 'Completed',
        };
        return labels[status] || status;
      });

      this.handlebarsTemplate = Handlebars.compile<ReportData>(templateContent);
    } catch (error) {
      console.error('Failed to compile Handlebars template:', error);
    }
  }

  async renderHtmlOnly(): Promise<string> {
    const data = this.getMockData();
    return this.renderTemplate(data);
  }

  async generateReport(): Promise<string> {
    const data = this.getMockData();
    
    let html: string;
    try {
      html = this.renderTemplate(data);
      console.log('HTML generated, length:', html.length);
    } catch (e) {
      console.error('Template render error:', e);
      throw e;
    }
    
    const pdfBuffer = await this.htmlToPdf(html);

    const fileName = `report-${data.year}-W${data.weekPad}-${Date.now()}.pdf`;
    const filePath = path.join(this.storagePath, fileName);

    fs.writeFileSync(filePath, pdfBuffer);

    return filePath;
  }

  private renderTemplate(data: ReportData): string {
    if (!this.handlebarsTemplate) {
      throw new Error('Template not compiled');
    }
    return this.handlebarsTemplate(data);
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private getMockData(): ReportData {
    const now = new Date();
    const week = 19;
    const year = 2026;

    return {
      reportTitle: 'Attack Surface Discovery Report',
      week,
      year,
      exportedAt: now.toISOString(),
      classification: 'Strictly Confidential',
      systemName: 'Open-ASM',
      formattedDate: now.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
      weekPad: String(week).padStart(2, '0'),
      systemNameChar: 'O',
      weekly: {
        totalTargets: 1452, targetsChange: 12, targetsChangePercent: 0.8,
        totalAssets: 3450, assetsChange: 45, assetsChangePercent: 1.3,
        totalServices: 892, servicesChange: -23, servicesChangePercent: -2.5,
        securityScore: 8.2, scoreChange: 0.3, scoreChangePercent: 3.8,
        activeVulns: 28, vulnsChange: -8, vulnsChangePercent: -22.2,
        criticalVulns: 3, criticalChange: -2, criticalChangePercent: -40,
        highVulns: 12, mediumVulns: 8, lowVulns: 5, infoVulns: 0,
        newVulns: 5, resolvedVulns: 13,
      },
      monthly: {
        totalTargets: 1452, targetsChange: 45, targetsChangePercent: 3.2,
        totalAssets: 3450, assetsChange: 120, assetsChangePercent: 3.6,
        totalServices: 892, servicesChange: -56, servicesChangePercent: -5.9,
        securityScore: 8.2, scoreChange: 0.6, scoreChangePercent: 7.9,
        activeVulns: 28, vulnsChange: -15, vulnsChangePercent: -34.9,
        criticalVulns: 3, criticalChange: -5, criticalChangePercent: -62.5,
        highVulns: 12, mediumVulns: 8, lowVulns: 5, infoVulns: 0,
        newVulns: 18, resolvedVulns: 33, scansCompleted: 12,
      },
      vulnerabilityTrends: {
        last7Days: [38, 22, 45, 18, 31, 27, 14],
        last30Days: [12, 8, 42, 15, 35, 50, 22, 6, 18, 45, 11, 30, 48, 9, 24, 38, 5, 20, 52, 14, 28, 44, 7, 33, 16, 40, 10, 25, 36, 13],
        avgPerWeek: 24, trend: 'decreasing',
      },
      newDiscoveries: {
        domains: [
          { identifier: 'api.example.com', discovered: '2026-05-08', provider: 'AWS CloudFront', riskLevel: 'medium' },
          { identifier: 'staging.example.com', discovered: '2026-05-07', provider: 'AWS CloudFront', riskLevel: 'low' },
          { identifier: 'test-portal.example.com', discovered: '2026-05-06', provider: 'Azure CDN', riskLevel: 'low' },
        ],
        ipAddresses: [
          { identifier: '10.0.1.50', discovered: '2026-05-09', provider: 'AWS EC2', riskLevel: 'low' },
          { identifier: '10.0.1.51', discovered: '2026-05-08', provider: 'AWS EC2', riskLevel: 'medium' },
          { identifier: '172.16.0.25', discovered: '2026-05-07', provider: 'On-Premise', riskLevel: 'critical' },
        ],
        ports: [
          { port: 3306, service: 'MySQL', discovered: '2026-05-09', target: '10.0.1.50', riskLevel: 'high' },
          { port: 6379, service: 'Redis', discovered: '2026-05-08', target: '10.0.1.51', riskLevel: 'high' },
          { port: 5432, service: 'PostgreSQL', discovered: '2026-05-07', target: '10.0.1.52', riskLevel: 'medium' },
        ],
        technologies: [
          { name: 'Nginx 1.18', discovered: '2026-05-07', target: 'api.example.com', category: 'Web Server' },
          { name: 'Node.js 18.0', discovered: '2026-05-06', target: 'api.example.com', category: 'Runtime' },
        ],
      },
      newFindings: [
        { id: 'VULN-001', title: 'Remote Code Execution in Apache Struts', severity: 'critical', cvss: 9.8, asset: 'api-v2.example.com', category: 'Web Application', discovered: '2026-05-09', status: 'not_analyzed' },
        { id: 'VULN-002', title: 'SQL Injection in Legacy API', severity: 'high', cvss: 8.2, asset: 'api.example.com/v1', category: 'API', discovered: '2026-05-08', status: 'running' },
        { id: 'VULN-003', title: 'Cross-Site Scripting in Admin Panel', severity: 'medium', cvss: 6.1, asset: 'admin.example.com', category: 'Web Application', discovered: '2026-05-07', status: 'not_analyzed' },
        { id: 'VULN-004', title: 'Exposed Docker Socket', severity: 'critical', cvss: 9.1, asset: '10.50.12.44', category: 'Infrastructure', discovered: '2026-05-06', status: 'running' },
      ],
      resolvedFindings: [
        { id: 'VULN-101', title: 'Outdated OpenSSL Library', resolved: '2026-05-10', daysOpen: 14 },
        { id: 'VULN-102', title: 'Exposed Prometheus Metrics', resolved: '2026-05-09', daysOpen: 7 },
        { id: 'VULN-103', title: 'Insecure Cookie Settings', resolved: '2026-05-08', daysOpen: 21 },
      ],
      riskDistribution: [
        { level: 'critical', count: 3, percent: 2.4, color: 'bg-red-600' },
        { level: 'high', count: 12, percent: 9.8, color: 'bg-orange-500' },
        { level: 'medium', count: 45, percent: 36.6, color: 'bg-yellow-500' },
        { level: 'low', count: 63, percent: 51.2, color: 'bg-blue-500' },
      ],
      targets: [
        { id: 'TARGET-001', identifier: 'example.com', type: 'DOMAIN', status: 'completed', riskLevel: 'low', provider: 'Cloudflare', lastScan: '1h ago' },
        { id: 'TARGET-002', identifier: 'auth.example.com', type: 'DOMAIN', status: 'completed', riskLevel: 'medium', provider: 'AWS CloudFront', lastScan: '45m ago' },
        { id: 'TARGET-003', identifier: '34.211.90.12', type: 'IP', status: 'completed', riskLevel: 'low', provider: 'AWS EC2', lastScan: '3h ago' },
        { id: 'TARGET-004', identifier: '192.168.1.0/24', type: 'CIDR', status: 'in_progress', riskLevel: 'medium', provider: 'Internal Network', lastScan: '12h ago' },
        { id: 'TARGET-005', identifier: 'api.example.com', type: 'DOMAIN', status: 'completed', riskLevel: 'high', provider: 'AWS Lambda', lastScan: '30m ago' },
        { id: 'TARGET-006', identifier: '10.50.12.44', type: 'IP', status: 'failed', riskLevel: 'critical', provider: 'On-Premise', lastScan: '15m ago' },
      ],
      vulnerabilityByTarget: [
        { target: 'api.example.com', type: 'DOMAIN', critical: 3, high: 5, medium: 8, low: 4, total: 20 },
        { target: 'auth.example.com', type: 'DOMAIN', critical: 2, high: 4, medium: 6, low: 3, total: 15 },
        { target: '10.50.12.44', type: 'IP', critical: 2, high: 3, medium: 4, low: 2, total: 11 },
        { target: 'admin.example.com', type: 'DOMAIN', critical: 1, high: 3, medium: 5, low: 2, total: 11 },
      ],
    };
  }
}