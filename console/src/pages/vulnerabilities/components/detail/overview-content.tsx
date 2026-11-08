import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OpenLink } from '@/components/ui/open-link';
import type { VulnerabilityDetailDto } from '@/services/apis/gen/queries';
import { htmlToPlainText } from '@/utils/html';
import dayjs from 'dayjs';
import {
  Check,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  Info,
  Link2,
  MapPin,
  Wrench,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useCallback, useState, type ReactNode } from 'react';
import { DetailSection } from '../../../issues/components/detail-blocks';
import { CodeLocation } from '../code-location';

/** Shared label style so every field label in the page reads the same. */
export const fieldLabel =
  'block mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, insecure context): nothing to undo.
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label={`Copy ${text}`}
      className="h-6 shrink-0 px-1.5 text-muted-foreground"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

/** Identifier badge list; renders a link per badge when `href` is given, and nothing when empty. */
export function IdGroup({
  label,
  ids,
  href,
}: {
  label: string;
  ids?: string[] | null;
  href?: (id: string) => string;
}) {
  if (!ids?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className={fieldLabel}>{label}</span>
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => {
          const url = href?.(id);
          if (!url)
            return (
              <Badge
                key={id}
                variant="outline"
                className="h-6 font-mono text-xs"
              >
                {id}
              </Badge>
            );
          return (
            <OpenLink
              key={id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Badge
                variant="outline"
                className="h-6 cursor-pointer font-mono text-xs transition-colors hover:bg-accent"
              >
                {id}
              </Badge>
            </OpenLink>
          );
        })}
      </div>
    </div>
  );
}

export const cweHref = (cwe: string) =>
  `https://cwe.mitre.org/data/definitions/${cwe.replace(/cwe-/i, '')}.html`;

/** Label / value line of a definition list; the label column has a fixed width. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function CopyValue({ value, href }: { value: string; href?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {href ? (
        <OpenLink
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 break-all font-mono text-[13px] text-primary hover:underline"
        >
          {value}
        </OpenLink>
      ) : (
        <span className="min-w-0 break-all font-mono text-[13px]">{value}</span>
      )}
      <CopyButton text={value} />
    </span>
  );
}

/** Splits a reference into its site and path so a long list stays scannable. */
function referenceParts(url: string): { host: string; rest: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname.replace(/^www\./, ''),
      rest: `${parsed.pathname}${parsed.search}`.replace(/\/$/, ''),
    };
  } catch {
    return { host: url, rest: '' };
  }
}

function ReferenceLink({ url }: { url: string }) {
  const { host, rest } = referenceParts(url);
  return (
    <li>
      <OpenLink
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group -mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
      >
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        <span className="min-w-0 text-sm">
          <span className="font-medium">{host}</span>
          {rest && (
            <span className="break-all text-muted-foreground">{rest}</span>
          )}
        </span>
      </OpenLink>
    </li>
  );
}

/** Description, fix, location, code, detection details and references of a finding. */
export function VulnerabilityOverview({
  data,
}: {
  data: VulnerabilityDetailDto;
}) {
  const description = data.description ? htmlToPlainText(data.description) : '';
  const synopsis =
    data.synopsis && data.synopsis !== data.description
      ? htmlToPlainText(data.synopsis)
      : '';
  const hasLocation = !!(
    data.asset ||
    data.affectedUrl ||
    data.host ||
    data.ipAddress ||
    data.ports?.length
  );
  const hasDetails = !!(
    data.authors?.length ||
    data.publicationDate ||
    data.modificationDate ||
    data.extractorName ||
    data.extractedResults?.length
  );
  const references = [
    ...(data.cveUrl ? [data.cveUrl] : []),
    ...(data.cweUrl ? [data.cweUrl] : []),
    ...(data.references ?? []),
  ].filter((ref, index, all) => all.indexOf(ref) === index);
  const isEmpty =
    !description &&
    !synopsis &&
    !data.solution &&
    !hasLocation &&
    !hasDetails &&
    !data.filePath &&
    !data.packageName &&
    references.length === 0;

  return (
    <div className="flex flex-col divide-y">
      {(description || synopsis) && (
        <DetailSection title="Description" icon={<FileText />}>
          {description && (
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
              {description}
            </p>
          )}
          {synopsis && (
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
              {synopsis}
            </p>
          )}
        </DetailSection>
      )}
      {data.solution && (
        <DetailSection title="Remediation" icon={<Wrench />}>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
              {htmlToPlainText(data.solution)}
            </p>
          </div>
        </DetailSection>
      )}
      {hasLocation && (
        <DetailSection title="Affected location" icon={<MapPin />}>
          <dl className="divide-y divide-dashed">
            {data.asset && (
              <Field label="Asset">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    to="/assets"
                    search={{ tab: 'service', filter: data.asset.value }}
                    className="break-all text-primary hover:underline"
                  >
                    {data.asset.value}
                  </Link>
                  {data.asset.targetId && (
                    <Link
                      to="/targets/$id"
                      params={{ id: data.asset.targetId }}
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      Open target
                    </Link>
                  )}
                </span>
              </Field>
            )}
            {data.affectedUrl && (
              <Field label="URL">
                <CopyValue value={data.affectedUrl} href={data.affectedUrl} />
              </Field>
            )}
            {data.host && (
              <Field label="Host">
                <CopyValue value={data.host} />
              </Field>
            )}
            {data.ipAddress && (
              <Field label="IP address">
                <CopyValue value={data.ipAddress} />
              </Field>
            )}
            {!!data.ports?.length && (
              <Field label="Ports">
                <span className="flex flex-wrap gap-1">
                  {data.ports.map((port) => (
                    <Badge key={port} variant="secondary" className="font-mono">
                      {port}
                    </Badge>
                  ))}
                </span>
              </Field>
            )}
          </dl>
        </DetailSection>
      )}
      {(data.filePath || data.packageName) && (
        <DetailSection title="Source code" icon={<FileCode />}>
          <CodeLocation vulnerability={data} labelClassName={fieldLabel} />
        </DetailSection>
      )}
      {hasDetails && (
        <DetailSection title="Detection details" icon={<Info />}>
          <dl className="divide-y divide-dashed">
            {!!data.authors?.length && (
              <Field label="Template authors">
                <span className="flex flex-wrap gap-1">
                  {data.authors.map((author) => (
                    <Badge key={author} variant="secondary">
                      {author}
                    </Badge>
                  ))}
                </span>
              </Field>
            )}
            {data.extractorName && (
              <Field label="Extractor">
                <span className="font-mono text-[13px]">
                  {data.extractorName}
                </span>
              </Field>
            )}
            {data.publicationDate && (
              <Field label="Published">
                {dayjs(data.publicationDate).format('YYYY-MM-DD HH:mm')}
              </Field>
            )}
            {data.modificationDate && (
              <Field label="Modified">
                {dayjs(data.modificationDate).format('YYYY-MM-DD HH:mm')}
              </Field>
            )}
          </dl>
          {!!data.extractedResults?.length && (
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabel}>Extracted results</span>
              <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                {data.extractedResults.join('\n')}
              </pre>
            </div>
          )}
        </DetailSection>
      )}
      {references.length > 0 && (
        <DetailSection title="References" icon={<Link2 />}>
          <ul className="flex flex-col">
            {references.map((ref) => (
              <ReferenceLink key={ref} url={ref} />
            ))}
          </ul>
        </DetailSection>
      )}
      {isEmpty && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          The scanner reported no further details for this finding.
        </p>
      )}
    </div>
  );
}
