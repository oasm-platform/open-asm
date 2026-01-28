import Handlebars from 'handlebars';
import { useEffect, useRef, useMemo } from 'react';
import type { SecurityReport, DeveloperVulnerability } from '../types';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ActionData {
  index?: number;
}

interface Props {
  template: string;
  data: {
    report: SecurityReport;
  };
  isEditing?: boolean;
  onUpdate?: (path: string, value: string) => void;
  onAction?: (action: string, data?: ActionData) => void;
}

// Register helpers ONCE globally to avoid re-registration overhead
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('add', (a, b) => a + b);
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj));
Handlebars.registerHelper('concat', (...args) => args.slice(0, -1).join(''));

export const HandlebarsRenderer = ({
  template,
  data,
  isEditing = false,
  onUpdate,
  onAction,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRenderedKey = useRef<string>('');

  // Helpers that access the current editing state
  useMemo(() => {
    Handlebars.registerHelper('hbsInput', function (path, value, className) {
      if (!isEditing) return value || '';
      return new Handlebars.SafeString(
        `<input class="bg-indigo-50/10 border-none p-1 rounded focus:ring-2 focus:ring-indigo-500 w-full outline-none ${className || ''}" 
          data-path="${path}" 
          value="${value || ''}" 
          placeholder="Edit..."/>`,
      );
    });

    Handlebars.registerHelper('hbsTextarea', function (path, value, className) {
      if (!isEditing) return value || '';
      return new Handlebars.SafeString(
        `<textarea class="bg-indigo-50/10 border-none p-1 rounded focus:ring-2 focus:ring-indigo-500 w-full resize-none overflow-hidden outline-none ${className || ''}" 
          data-path="${path}" 
          rows="1"
          oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
          placeholder="Edit description...">${value || ''}</textarea>`,
      );
    });

    Handlebars.registerHelper('severityColorClass', (severity: string) => {
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
  }, [isEditing]);

  const compiledTemplate = useMemo(
    () => Handlebars.compile(template),
    [template],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const vulnsLength =
      data.report.content?.developer?.vulnerabilities?.length || 0;
    const risksLength = data.report.content?.executive?.top3Risks?.length || 0;
    const currentKey = `${data.report.targetRole}-${vulnsLength}-${risksLength}-${isEditing}`;

    if (currentKey !== lastRenderedKey.current) {
      const vulnerabilities =
        data.report.content?.developer?.vulnerabilities || [];
      const severityCounts = vulnerabilities.reduce(
        (acc: SeverityCounts, v: DeveloperVulnerability) => {
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
        (acc: Record<string, number>, v: DeveloperVulnerability) => {
          const cat = v.category || 'Uncategorized';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        },
        {},
      );

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

      // Normalize to 0-100 for radar/progress (randomized slightly to avoid 0s if data is sparse)
      const norm = (val: number) =>
        Math.min(100, Math.max(10, val * 15 + Math.floor(Math.random() * 20)));

      const renderData = {
        ...data,
        isEditing,
        year: new Date().getFullYear(),
        formattedDate: new Date(data.report.createdAt).toLocaleDateString(),
        severityCounts,
        categoryCounts: {
          labels: Object.keys(categoryCountsMap),
          values: Object.values(categoryCountsMap),
        },
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
          total: vulnerabilities.length,
        },
      };

      containerRef.current.innerHTML = compiledTemplate(renderData);
      lastRenderedKey.current = currentKey;

      // Manually execute scripts to allow Chart.js to initialize
      // But FILTER OUT Tailwind CDN to prevent it from corrupting the main app's styles
      const scripts = containerRef.current.querySelectorAll('script');
      scripts.forEach((oldScript) => {
        const src = oldScript.getAttribute('src');
        if (src && src.includes('tailwindcss.com')) {
          // Skip Tailwind CDN script to avoid breaking root app borders
          return;
        }

        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) =>
          newScript.setAttribute(attr.name, attr.value),
        );
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });
    }
  }, [data, isEditing, compiledTemplate]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const path = target.getAttribute('data-path');
    if (path && onUpdate) {
      onUpdate(path, target.value);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const button = target.closest('[data-action]');
    if (button && onAction) {
      const action = button.getAttribute('data-action')!;
      const index = button.getAttribute('data-index');
      onAction(action, { index: index ? parseInt(index) : undefined });
    }
  };

  return (
    <div
      ref={containerRef}
      className="handlebars-container"
      onInput={handleInput}
      onClick={handleClick}
    />
  );
};
