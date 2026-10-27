import { AuditOutcome, Severity } from '@/common/enums/enum';
import {
  getEventDefinition,
  type EventName,
} from '../../../contracts/event-catalog';
import type { ConsumedEvent } from '../../../contracts/event-envelope';
import {
  hasUnfinishedSteps,
  readPayload,
  type DetectedVulnerability,
} from '../../../contracts/event-payloads';
import { describeIncompleteSteps } from '../../shared/run-steps';
import type { Line, MessageDraft } from './message-draft';

/**
 * Event → {@link MessageDraft}: the view layer.
 *
 * Producers publish full records (`event-payloads.ts`); everything a reader
 * needs to make sense of them — counts, worst-first ranking, a short preview,
 * the sentence itself — is derived HERE, so the wording can change without
 * touching a producer and every channel derives it the same way.
 */

export const SEVERITY_ORDER: Severity[] = [
  Severity.CRITICAL,
  Severity.HIGH,
  Severity.MEDIUM,
  Severity.LOW,
  Severity.INFO,
];

const SEVERITY_ICON: Record<Severity, string> = {
  [Severity.CRITICAL]: '🔴',
  [Severity.HIGH]: '🟠',
  [Severity.MEDIUM]: '🟡',
  [Severity.LOW]: '🟢',
  [Severity.INFO]: '🔵',
};

/** How many findings a message previews, worst first. */
const FINDINGS_PREVIEW = 5;
/** Long names would push a Telegram message past its 4096-char limit. */
const MAX_TEXT = 120;
const MAX_GENERIC_FIELDS = 8;

export function draftMessage(name: EventName, event: ConsumedEvent): MessageDraft {
  const footer = { actor: event.actor?.name, occurredAt: event.occurredAt };
  switch (name) {
    case 'vulnerability.detected':
      return { ...draftVulnerabilityDetected(event), footer };
    case 'workflow.run.completed':
      return { ...draftWorkflowRun(event), footer };
    case 'vulnerability.status.updated':
      return { ...draftVulnerabilityStatus(event), footer };
    case 'asset.url.discovered':
      return { ...draftUrlDiscovered(event), footer };
    default:
      return { ...draftGeneric(name, event), footer };
  }
}

/** Worst first: severity, then CVSS. */
export function rankBySeverity(
  vulns: DetectedVulnerability[],
): DetectedVulnerability[] {
  const rank = (s: Severity) => {
    const i = SEVERITY_ORDER.indexOf(s);
    return i === -1 ? SEVERITY_ORDER.length : i;
  };
  return [...vulns].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) ||
      (b.cvssScore ?? 0) - (a.cvssScore ?? 0),
  );
}

type Body = Omit<MessageDraft, 'footer'>;

function draftVulnerabilityDetected(event: ConsumedEvent): Body {
  const p = readPayload('vulnerability.detected', event);
  const vulns = p.vulnerabilities ?? [];
  const count = vulns.length;
  const fields: Body['fields'] = [];

  if (p.assetValue) {
    fields.push({ label: 'Asset', value: [{ code: p.assetValue }] });
  }

  const bySeverity = SEVERITY_ORDER.map(
    (s) => [s, vulns.filter((v) => v.severity === s).length] as const,
  ).filter(([, n]) => n > 0);
  if (bySeverity.length > 0) {
    fields.push({
      label: 'Severity',
      value: [
        bySeverity.map(([s, n]) => `${SEVERITY_ICON[s]} ${n} ${s}`).join(' · '),
      ],
    });
  }

  const preview = rankBySeverity(vulns).slice(0, FINDINGS_PREVIEW);
  return {
    icon: '🚨',
    title: `${count} new ${plural(count, 'vulnerability', 'vulnerabilities')} found`,
    fields,
    list:
      preview.length > 0
        ? {
            heading: preview.length < count ? 'Top findings' : 'Findings',
            items: preview.map(findingLine),
            more: count - preview.length,
          }
        : undefined,
  };
}

function findingLine(v: DetectedVulnerability): Line {
  const line: Line = [
    `${SEVERITY_ICON[v.severity] ?? '•'} `,
    { bold: clip(v.name) },
  ];
  const cves = (v.cveId ?? []).filter(Boolean);
  if (cves.length > 0) {
    line.push(' — ', { code: cves.slice(0, 2).join(', ') });
  }
  // Scanners report 0 for unscored findings (info); "CVSS 0.0" is noise.
  if (typeof v.cvssScore === 'number' && v.cvssScore > 0) {
    line.push(` (CVSS ${v.cvssScore.toFixed(1)})`);
  }
  const location = v.affectedUrl ?? v.host;
  if (location) {
    line.push(' @ ', { code: clip(location) });
  }
  return line;
}

function draftWorkflowRun(event: ConsumedEvent): Body {
  const p = readPayload('workflow.run.completed', event);
  const fields: Body['fields'] = [];
  if (p.targetValue) {
    fields.push({ label: 'Target', value: [{ code: p.targetValue }] });
  }

  const discovered = [
    [p.hosts, 'host', 'hosts'],
    [p.ports, 'port', 'ports'],
    [p.services, 'service', 'services'],
    [p.techs, 'technology', 'technologies'],
  ] as const;
  const parts = discovered
    .filter(([n]) => (n ?? 0) > 0)
    .map(([n, one, many]) => `${n} ${plural(n ?? 0, one, many)}`);
  fields.push({
    label: 'New assets',
    value: [parts.length > 0 ? parts.join(' · ') : 'none'],
  });

  const incomplete = hasUnfinishedSteps(p);
  if (incomplete) {
    fields.push({ label: 'Details', value: [clip(describeIncompleteSteps(p))] });
  }

  return event.outcome === AuditOutcome.Failure || incomplete
    ? { icon: '⚠️', title: 'Scan finished incomplete', fields }
    : { icon: '✅', title: 'Scan completed', fields };
}

function draftUrlDiscovered(event: ConsumedEvent): Body {
  const p = readPayload('asset.url.discovered', event);
  const count = p.count ?? 0;
  const fields: Body['fields'] = [];
  if (p.targetValue) {
    fields.push({ label: 'Target', value: [{ code: p.targetValue }] });
  }

  const preview = (p.urls ?? []).slice(0, FINDINGS_PREVIEW);
  return {
    icon: '🔗',
    title: `${count} new ${plural(count, 'URL', 'URLs')} found`,
    fields,
    list:
      preview.length > 0
        ? {
            heading: 'URLs',
            items: preview.map((url): Line => [{ code: clip(url) }]),
            more: Math.max(0, count - preview.length),
          }
        : undefined,
  };
}

function draftVulnerabilityStatus(event: ConsumedEvent): Body {
  const action = String(event.metadata?.action ?? 'update');
  const count = Number(event.metadata?.count ?? 0);
  const past: Record<string, string> = {
    dismiss: 'dismissed',
    reopen: 'reopened',
  };
  const subject =
    count > 0
      ? `${count} ${plural(count, 'vulnerability', 'vulnerabilities')}`
      : 'Vulnerability status';
  return {
    icon: action === 'dismiss' ? '🔕' : '🔄',
    title: `${subject} ${past[action] ?? 'updated'}`,
    fields: [],
  };
}

/**
 * Fallback for events without a dedicated draft: the catalog summary as the
 * title and the scalar payload/metadata values as fields. Keeps a newly pushed
 * event readable instead of silently empty.
 */
function draftGeneric(name: EventName, event: ConsumedEvent): Body {
  const fields: Body['fields'] = [];
  if (event.resourceType && event.resourceId) {
    fields.push({
      label: humanize(event.resourceType),
      value: [{ code: event.resourceId }],
    });
  }
  const scalars = {
    ...(isRecord(event.payload) ? event.payload : {}),
    ...(event.metadata ?? {}),
  };
  for (const [key, value] of Object.entries(scalars)) {
    if (fields.length >= MAX_GENERIC_FIELDS) break;
    const text = scalarText(value);
    if (text !== undefined) {
      fields.push({ label: humanize(key), value: [clip(text)] });
    }
  }
  return {
    icon: event.outcome === AuditOutcome.Failure ? '❌' : 'ℹ️',
    title: getEventDefinition(name)?.summary ?? name,
    fields,
  };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** `targetValue` / `workflow_run` → `Target value` / `Workflow run`. */
function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value.length > 0 ? value.join(', ') : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
