import { useCallback } from 'react';
import {
  useAiChatConversation,
  useAiChatPanelOpen,
  type AiChatStartConfig,
} from './useAiChatPanel';

export type { AiChatStartConfig };

/**
 * Opens the AI chat sidebar from anywhere in the app.
 *
 * With a `config`, `openChat()` starts a new conversation in that state:
 * mode, project, worker, and a first message sent at once or left in the
 * input. Without one it just shows the panel on the chat it had.
 *
 * @example
 * const { openChat } = useAiChat({ agentMode: 'agent', text: `Pentest ${host}` });
 * <AiButton label="Run AI Pentest" onClick={() => openChat()} />
 */
export function useAiChat(config?: AiChatStartConfig) {
  const { state: isOpen, open, close, toggle } = useAiChatPanelOpen();
  const { startChat } = useAiChatConversation();

  /** Opens the panel; `override` is merged over the hook's config */
  const openChat = useCallback(
    (override?: AiChatStartConfig) => {
      const start = config || override ? { ...config, ...override } : null;
      if (start) startChat(start);
      open();
    },
    [config, startChat, open],
  );

  return { isOpen, openChat, close, toggle };
}
