import { useSyncExternalStore } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type {
  ConversationProjectDto,
  SendMessageDtoAgentMode,
} from '@/services/apis/gen/queries';
import createState from './createState';

const OPEN_STORAGE_KEY = 'ai-chat-panel-open';
const CONVERSATION_STORAGE_KEY = 'ai-chat-panel-conversation';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable — keep the in-memory value
  }
}

/** Kept per browser, so a reload comes back with the panel as it was */
function persistOpen(isOpen: boolean): boolean {
  writeStorage(OPEN_STORAGE_KEY, String(isOpen));
  return isOpen;
}

/**
 * Whether the AI chat panel beside the app is open: global state, toggled
 * from the header and read by the layout that makes room for the panel.
 */
export const useAiChatPanelOpen = createState<boolean>(
  'ai-chat-panel-open',
  readStorage(OPEN_STORAGE_KEY) === 'true',
  {
    toggle: (isOpen) => persistOpen(!isOpen),
    open: () => persistOpen(true),
    close: () => persistOpen(false),
  },
);

/** How a new chat in the panel starts */
export interface AiChatStartConfig {
  /** First message: sent at once, unless `autoSubmit` is false */
  text?: string;
  /** False leaves `text` in the input for the user to finish and send */
  autoSubmit?: boolean;
  /** `ask` (default) or `agent` */
  agentMode?: SendMessageDtoAgentMode;
  /** The project the chat is about: the agent's tools stay inside it */
  project?: ConversationProjectDto | null;
  /** Worker for agent mode; left out lets the server pick one */
  workerId?: string | null;
}

interface AiChatConversationState {
  /** The chat shown in the panel */
  conversationId: string;
  /**
   * The id was made here and the chat has no server copy until its first
   * message: there is no history to load for it
   */
  isNew: boolean;
  /** How the new chat starts; cleared once the panel has applied it */
  start: { conversationId: string; config: AiChatStartConfig } | null;
}

const listeners = new Set<() => void>();

// A saved chat comes back after a reload; a new one is only kept once sent
const storedConversationId = readStorage(CONVERSATION_STORAGE_KEY);

// Outside the query cache on purpose: a fresh id must never be replaced by
// the initial one if the cache dropped it, or a sent chat would be "new" again
let current: AiChatConversationState = {
  conversationId: storedConversationId ?? uuidv7(),
  isNew: !storedConversationId,
  start: null,
};

function update(next: Partial<AiChatConversationState>) {
  current = { ...current, ...next };
  writeStorage(
    CONVERSATION_STORAGE_KEY,
    current.isNew ? null : current.conversationId,
  );
  listeners.forEach((l) => l());
}

const conversationActions = {
  newChat: () => update({ conversationId: uuidv7(), isNew: true, start: null }),
  /** A new chat that starts as `config` says */
  startChat: (config: AiChatStartConfig) => {
    const conversationId = uuidv7();
    update({ conversationId, isNew: true, start: { conversationId, config } });
  },
  /** The panel applied the start config: it must not run again */
  clearStart: () => {
    if (current.start) update({ start: null });
  },
  openConversation: (conversationId: string) => {
    if (conversationId !== current.conversationId) {
      update({ conversationId, isNew: false, start: null });
    }
  },
  /** The first message went out: the chat now exists on the server */
  markStarted: () => {
    if (current.isNew) update({ isNew: false });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The conversation the AI chat panel shows. Kept in the browser, so closing,
 * reopening or reloading comes back to the same chat.
 */
export function useAiChatConversation() {
  const state = useSyncExternalStore(subscribe, () => current);
  return { state, ...conversationActions };
}
