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
  deleteConversation?: (id: string) => Promise<void>;
  deleteAllConversations?: () => Promise<void>;
  search?: string;
  setSearch?: (val: string) => void;
  page?: number;
  setPage?: (val: number | ((prev: number) => number)) => void;
  limit?: number;
  totalCount?: number;
  isLoadingConversations?: boolean;
};

export type ChatMessagesProps = {
  messages: Message[];
};

export type ChatSidebarProps = {
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateNewSession: () => void;
};
