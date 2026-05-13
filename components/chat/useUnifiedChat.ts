
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatAdapter, ChatMessage, ChatRole, ChatHeaderInfo, MessageType } from './chatAdapter';
import { playNotificationSound } from '../../utils/notificationSound';

export interface UseUnifiedChatProps<TContext> {
  adapter: ChatAdapter<TContext>;
  context: TContext;
  role: ChatRole;
  userId: string;
}

export const useUnifiedChat = <TContext>({
  adapter,
  context,
  role,
  userId
}: UseUnifiedChatProps<TContext>) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [headerInfo, setHeaderInfo] = useState<ChatHeaderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [ticketStatus, setTicketStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const features = adapter.getFeatures();

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth', force = false) => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight, scrollTop } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      if (force || isNearBottom) {
        scrollRef.current.scrollTo({
          top: scrollHeight - clientHeight,
          behavior
        });
      }
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setIsLoading(true);
      try {
        const [msgs, header] = await Promise.all([
          adapter.listMessages(context),
          adapter.getHeader(context)
        ]);

        if (isMounted) {
          setMessages(msgs);
          setHeaderInfo(header);
          if (header.status) setTicketStatus(header.status);
          if (header.isOnline !== undefined) setIsOnline(header.isOnline);
          
          // Marca como lido na carga inicial
          if (adapter.markAsRead) {
            adapter.markAsRead(context).catch(e => console.warn('[UnifiedChat] Error marking as read:', e));
          }

          // Scroll inicial sem animação
          setTimeout(() => scrollToBottom('auto', true), 100);
        }
      } catch (error) {
        console.error('[UnifiedChat] Error loading initial data:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    init();

    // Inscrição Realtime
    const unsubscribe = adapter.subscribeMessages(context, {
      onNewMessage: (msg) => {
        setMessages((prev) => {
            // Evita duplicatas se o adapter não filtrar
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
        });
        
        // Som se não for minha
        const isMine = msg.sender_user_id === userId || msg.operator_id === userId;
        if (!isMine) {
          playNotificationSound();
          if (adapter.markAsRead) {
            adapter.markAsRead(context).catch(e => console.warn('[UnifiedChat] Error marking as read on new message:', e));
          }
        }
        
        setTimeout(() => scrollToBottom(), 100);
      },
      onDeleteMessage: (id) => {
        setMessages((prev) => prev.filter(m => m.id !== id));
      },
      onStatusChange: (status) => {
        setTicketStatus(status);
        setHeaderInfo(prev => prev ? { ...prev, status } : null);
      },
      onPresenceChange: (online) => {
        setIsOnline(online);
        setHeaderInfo(prev => prev ? { ...prev, isOnline: online } : null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [adapter, context, userId, scrollToBottom]);

  const sendMessage = async (content: string, type: MessageType = 'text', file?: File, metadata?: any) => {
    if (isUploading) return;
    
    setIsUploading(true);
    try {
      await adapter.sendMessage(context, {
        content,
        type,
        file,
        metadata,
        role,
        userId
      });
      scrollToBottom('smooth', true);
    } catch (error) {
      console.error('[UnifiedChat] Error sending message:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!adapter.deleteMessage) return;
    try {
      await adapter.deleteMessage(context, messageId);
    } catch (error) {
      console.error('[UnifiedChat] Error deleting message:', error);
      throw error;
    }
  };

  const toggleTicket = async () => {
    if (ticketStatus === 'OPEN') {
      if (adapter.closeTicket) await adapter.closeTicket(context);
    } else {
      if (adapter.reopenTicket) await adapter.reopenTicket(context);
    }
  };

  return {
    messages,
    headerInfo,
    isLoading,
    isUploading,
    isOnline,
    ticketStatus,
    scrollRef,
    features,
    sendMessage,
    deleteMessage,
    toggleTicket,
    scrollToBottom
  };
};
