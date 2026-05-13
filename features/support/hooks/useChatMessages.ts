
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { supportChatService, SupportMessage, SupportMessageType } from '../../../services/supportChat.service';
import { playNotificationSound } from '../../../utils/notificationSound';

interface UseChatMessagesProps {
  loanId: string;
  profileId: string;
  senderType: 'CLIENT' | 'OPERATOR';
  operatorId?: string;
}

export const useChatMessages = ({ loanId, profileId, senderType, operatorId }: UseChatMessagesProps) => {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
      }, 100);
    }
  };

  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const data = await supportChatService.getMessages(loanId);
        setMessages(data);
        scrollToBottom();
        await supportChatService.markAsRead(loanId, senderType);
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`chat-${loanId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_suporte', filter: `loan_id=eq.${loanId}` },
        async (payload) => {
          const newMsg = payload.new as SupportMessage;
          
          // Se não for o próprio usuário, toca som
          if (newMsg.sender_type !== senderType) {
            playNotificationSound();
            // Marca como lido se a janela estiver aberta (implícito pelo hook rodando)
            supportChatService.markAsRead(loanId, senderType);
          }

          // Se a mensagem tiver anexo, recarregamos para garantir a Signed URL
          // Caso contrário, adicionamos direto para rapidez
          const hasAttachment = ['image', 'audio', 'file'].includes(newMsg.type || '');
          
          if (hasAttachment) {
             const freshData = await supportChatService.getMessages(loanId);
             setMessages(freshData);
          } else {
             setMessages((prev) => [...prev, newMsg]);
          }
          
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loanId, senderType]);

  const sendMessage = async (
    text: string, 
    type: SupportMessageType = 'text', 
    file?: File, 
    metadata?: any
  ) => {
    setIsUploading(true);
    try {
      await supportChatService.sendMessage({
        profileId,
        loanId,
        sender: senderType,
        operatorId,
        text,
        type,
        file,
        metadata
      });
      scrollToBottom();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    messages,
    isLoading,
    isUploading,
    sendMessage,
    scrollRef,
    scrollToBottom
  };
};
