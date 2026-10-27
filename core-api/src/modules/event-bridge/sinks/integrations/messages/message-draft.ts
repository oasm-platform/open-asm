/**
 * A chat message before it is rendered: WHAT to say, with no markup.
 *
 * Drafts are built from event payloads (`event-drafts.ts`) and rendered per
 * channel (`render.ts`). Keeping the two apart is what lets Telegram, Slack and
 * plain webhooks say the same thing while each gets its own markup.
 */

/** Inline text: plain, bold or monospace. Escaping happens at render time. */
export type Inline = string | { bold: string } | { code: string };
export type Line = Inline[];

export interface MessageDraft {
  icon: string;
  title: string;
  fields: Array<{ label: string; value: Line }>;
  list?: { heading: string; items: Line[]; more: number };
  footer: {
    actor?: string;
    /** ISO timestamp. */
    occurredAt?: string;
  };
}

/** Markup dialect of the receiving channel. */
export type MessageFormat = 'telegram' | 'slack' | 'discord' | 'plain';
