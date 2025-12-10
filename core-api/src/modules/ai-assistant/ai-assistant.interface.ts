/**
 * gRPC Client Service Interfaces
 * These interfaces define the client-side methods for calling gRPC services
 */

import type { Observable } from 'rxjs';
import type {
  DomainClassifyRequest,
  DomainClassifyResponse,
  GetMCPServersRequest,
  GetMCPServersResponse,
  AddMCPServersRequest,
  AddMCPServersResponse,
  UpdateMCPServersRequest,
  UpdateMCPServersResponse,
  DeleteMCPServersRequest,
  DeleteMCPServersResponse,
  GetMCPServerHealthRequest,
  GetMCPServerHealthResponse,
  GetConversationsRequest,
  GetConversationsResponse,
  UpdateConversationRequest,
  UpdateConversationResponse,
  DeleteConversationRequest,
  DeleteConversationResponse,
  DeleteConversationsRequest,
  DeleteConversationsResponse,
  GetMessagesRequest,
  GetMessagesResponse,
  CreateMessageRequest,
  CreateMessageResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  DeleteMessageRequest,
  DeleteMessageResponse,
} from '@/types/assistant';

/**
 * Domain Classification Service Client
 */
export interface DomainClassifyService {
  domainClassify(
    request: DomainClassifyRequest,
    metadata?: unknown,
  ): Observable<DomainClassifyResponse>;
}

/**
 * MCP Server Service Client
 */
export interface MCPServerService {
  getMcpServers(
    request: GetMCPServersRequest,
    metadata?: unknown,
  ): Observable<GetMCPServersResponse>;
  addMcpServers(
    request: AddMCPServersRequest,
    metadata?: unknown,
  ): Observable<AddMCPServersResponse>;
  updateMcpServers(
    request: UpdateMCPServersRequest,
    metadata?: unknown,
  ): Observable<UpdateMCPServersResponse>;
  deleteMcpServers(
    request: DeleteMCPServersRequest,
    metadata?: unknown,
  ): Observable<DeleteMCPServersResponse>;
  getMcpServerHealth(
    request: GetMCPServerHealthRequest,
    metadata?: unknown,
  ): Observable<GetMCPServerHealthResponse>;
}

/**
 * Conversation Service Client
 */
export interface ConversationService {
  getConversations(
    request: GetConversationsRequest,
    metadata?: unknown,
  ): Observable<GetConversationsResponse>;
  updateConversation(
    request: UpdateConversationRequest,
    metadata?: unknown,
  ): Observable<UpdateConversationResponse>;
  deleteConversation(
    request: DeleteConversationRequest,
    metadata?: unknown,
  ): Observable<DeleteConversationResponse>;
  deleteConversations(
    request: DeleteConversationsRequest,
    metadata?: unknown,
  ): Observable<DeleteConversationsResponse>;
}

/**
 * Message Service Client
 */
export interface MessageService {
  getMessages(
    request: GetMessagesRequest,
    metadata?: unknown,
  ): Observable<GetMessagesResponse>;
  createMessage(
    request: CreateMessageRequest,
    metadata?: unknown,
  ): Observable<CreateMessageResponse>;
  updateMessage(
    request: UpdateMessageRequest,
    metadata?: unknown,
  ): Observable<UpdateMessageResponse>;
  deleteMessage(
    request: DeleteMessageRequest,
    metadata?: unknown,
  ): Observable<DeleteMessageResponse>;
}
