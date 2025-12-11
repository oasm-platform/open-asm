// Import types from generated API
import type {
  GetConversationsResponseDtoConversationsItem,
  GetMessagesResponseDtoMessagesItem,
} from '@/services/apis/gen/queries';

export type Conversation = GetConversationsResponseDtoConversationsItem;

export type Message = GetMessagesResponseDtoMessagesItem;

export type ChatSession = {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  unread?: boolean;
  conversationId?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AssistantChatProps = {
  initialMessages?: Message[];
  onSendMessage?: (message: string) => void;
};

export type ChatHeaderProps = {
  title?: string;
  sessions?: ChatSession[];
  currentSessionId?: string;
  onSelectSession?: (id: string) => void;
  onCreateNewSession?: () => void;
  onClose?: () => void;
  showSidebar?: boolean;
};

export type ChatMessagesProps = {
  messages: Message[];
};

export type ChatInputProps = {
  inputMessage: string;
  setInputMessage: (value: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  onKeyPress?: (e: React.KeyboardEvent) => void;
};

export type ChatSidebarProps = {
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
};
