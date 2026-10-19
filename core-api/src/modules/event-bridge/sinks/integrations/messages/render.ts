import type { Inline, Line, MessageDraft, MessageFormat } from './message-draft';

/**
 * Renders a {@link MessageDraft} in a channel's markup. Pure presentation: no
 * event knowledge lives here, only how bold/code/lists look per channel.
 */

export function formatForAppType(appType: string): MessageFormat {
  if (appType === 'telegram') return 'telegram';
  if (appType === 'slack') return 'slack';
  if (appType === 'discord') return 'discord';
  return 'plain';
}

export function renderMessage(d: MessageDraft, format: MessageFormat): string {
  const inline = (line: Line) => line.map((part) => span(part, format)).join('');
  const out: string[] = [`${d.icon} ${span({ bold: d.title }, format)}`];

  if (d.fields.length > 0) {
    out.push('');
    for (const f of d.fields) {
      out.push(`${span({ bold: `${f.label}:` }, format)} ${inline(f.value)}`);
    }
  }

  if (d.list && d.list.items.length > 0) {
    out.push('', span({ bold: d.list.heading }, format));
    for (const item of d.list.items) {
      out.push(`• ${inline(item)}`);
    }
    if (d.list.more > 0) {
      out.push(span(`…and ${d.list.more} more`, format));
    }
  }

  const footer = [
    d.footer.actor ? `👤 ${d.footer.actor}` : '',
    d.footer.occurredAt ? `🕒 ${formatTime(d.footer.occurredAt)}` : '',
  ].filter(Boolean);
  if (footer.length > 0) {
    out.push('', span(footer.join('  ·  '), format));
  }

  return out.join('\n');
}

function span(part: Inline, format: MessageFormat): string {
  if (typeof part === 'string') return escape(part, format);
  if ('bold' in part) {
    const text = escape(part.bold, format);
    if (format === 'telegram') return `<b>${text}</b>`;
    if (format === 'slack') return `*${text}*`;
    if (format === 'discord') return `**${text}**`;
    return text;
  }
  // Markdown code spans are literal, so Discord only needs backticks neutralised.
  if (format === 'discord') return `\`${part.code.replace(/`/g, "'")}\``;
  const text = escape(part.code, format);
  if (format === 'telegram') return `<code>${text}</code>`;
  if (format === 'slack') return `\`${text.replace(/`/g, "'")}\``;
  return text;
}

/**
 * Telegram HTML and Slack mrkdwn both treat `&`, `<`, `>` as markup; payload
 * values are scanner output and must never be able to inject any.
 */
function escape(text: string, format: MessageFormat): string {
  if (format === 'plain') return text;
  // Discord markdown has no entities; backslash-escape its markup characters.
  if (format === 'discord') return text.replace(/[\\*_~`|>[\]()#-]/g, '\\$&');
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `2026-10-11T10:05:00.000Z` → `2026-10-11 10:05 UTC`. */
function formatTime(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}
