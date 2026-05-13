
import { ReactNode } from 'react';

export type ChatRole = 'CLIENT' | 'OPERATOR' | 'LEAD';

export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'location';

export interface ChatMessage {
  id: string;
  content: string | ReactNode;
  text?: string;
  type: MessageType;
  sender_type: ChatRole;
  sender_user_id?: string;
  operator_id?: string;
  created_at: string;
  file_url?: string;
  read?: boolean;
  metadata?: any;
}

export interface ChatFeatures {
  hasTicket: boolean;
  hasPresence: boolean;
  canClose: boolean;
  canDelete: boolean;
  canUpload: boolean;
}

export interface ChatHeaderInfo {
  title: string;
  subtitle: string;
  status?: 'OPEN' | 'CLOSED';
  isOnline?: boolean;
}

export interface ChatAdapter<TContext> {
  getFeatures(): ChatFeatures;
  getHeader(context: TContext): Promise<ChatHeaderInfo>;
  listMessages(context: TContext): Promise<ChatMessage[]>;
  subscribeMessages(context: TContext, handlers: {
    onNewMessage: (msg: ChatMessage) => void;
    onDeleteMessage?: (id: string) => void;
    onStatusChange?: (status: any) => void;
    onPresenceChange?: (isOnline: boolean) => void;
  }): () => void;
  sendMessage(context: TContext, payload: {
    content: string;
    type: MessageType;
    file?: File;
    metadata?: any;
    role: ChatRole;
    userId: string;
  }): Promise<void>;
  deleteMessage?(context: TContext, messageId: string): Promise<void>;
  markAsRead?(context: TContext): Promise<void>;
  closeTicket?(context: TContext): Promise<void>;
  reopenTicket?(context: TContext): Promise<void>;
}
