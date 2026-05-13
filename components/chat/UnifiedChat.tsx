import React, { useMemo } from 'react';
import { ChatAdapter, ChatRole } from './chatAdapter';
import { useUnifiedChat } from './useUnifiedChat';
import { ChatMessages } from '../../features/support/components/ChatMessages';
import { ChatInput } from '../../features/support/components/ChatInput';
import { Loader2, MessageCircle, ShieldCheck, Lock, Unlock, Trash2, ChevronLeft } from 'lucide-react';
import { useModal } from '../../contexts/ModalContext';

export interface UnifiedChatProps<TContext> {
  adapter: ChatAdapter<TContext>;
  context: TContext;
  role: ChatRole;
  userId: string;
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  showDeleteHistory?: boolean;
  onDeleteHistory?: () => Promise<void>;
  chatTheme?: 'dark' | 'blue';
}

export function UnifiedChat<TContext>({
  adapter,
  context,
  role,
  userId,
  title,
  subtitle,
  onClose,
  showDeleteHistory,
  onDeleteHistory,
  chatTheme = 'dark'
}: UnifiedChatProps<TContext>) {
  const {
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
    toggleTicket
  } = useUnifiedChat({ adapter, context, role, userId });

  const { showToast } = useModal();

  const displayTitle = title || headerInfo?.title || 'Chat';
  const displaySubtitle = subtitle || headerInfo?.subtitle || '';

  const initials = useMemo(() => {
    if (!displayTitle || displayTitle === 'Chat') return 'CF';
    const parts = displayTitle.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return displayTitle.charAt(0).toUpperCase();
  }, [displayTitle]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col relative min-h-0 overflow-hidden ${chatTheme === 'blue' ? 'bg-slate-900/50' : 'bg-slate-900'}`}>
      {/* Header Interno do Chat */}
      <div className={`h-20 border-b flex items-center justify-between px-6 shrink-0 relative z-20 backdrop-blur-md ${
        chatTheme === 'blue' 
          ? 'bg-slate-900/60 border-blue-500/20' 
          : 'bg-slate-950/40 border-slate-800/50'
      }`}>
        <div className="flex items-center gap-4 min-w-0">
          {onClose && (
            <button 
              onClick={onClose} 
              className="p-2.5 -ml-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all active:scale-90"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="relative group">
            <div className="w-12 h-12 rounded-[1.2rem] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black shrink-0 shadow-xl shadow-blue-500/20 group-hover:scale-105 transition-transform">
              {initials}
            </div>
            {features.hasPresence && (
              <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-950 shadow-lg ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-black text-white uppercase tracking-wider truncate">{displayTitle}</h2>
            <div className="flex items-center gap-2">
               <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
               <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">
                 {isOnline ? 'Disponível Online' : displaySubtitle || 'Offline'}
               </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
            {showDeleteHistory && onDeleteHistory && (
                <button 
                    onClick={onDeleteHistory}
                    className="p-3 rounded-2xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all active:scale-95"
                    title="Apagar Histórico"
                >
                    <Trash2 size={18}/>
                </button>
            )}
            
            {features.canClose && (
                <button 
                    onClick={toggleTicket}
                    className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase shadow-xl border transition-all flex items-center gap-2 active:scale-95 ${
                      ticketStatus === 'OPEN' 
                        ? 'bg-amber-500 text-black border-amber-400 hover:bg-amber-400' 
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                >
                    {ticketStatus === 'OPEN' ? <><Lock size={12}/> Encerrar</> : <><Unlock size={12}/> Reabrir</>}
                </button>
            )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none z-10 opacity-40"></div>
          <ChatMessages 
            messages={messages as any}
            currentUserId={userId}
            senderType={role === 'OPERATOR' ? 'OPERATOR' : 'CLIENT'}
            scrollRef={scrollRef}
            onDeleteMessage={features.canDelete ? deleteMessage : undefined}
            chatTheme={chatTheme}
          />
      </div>

      {/* Input */}
      <div className="p-4 sm:p-6 bg-transparent relative z-40">
          <ChatInput 
            onSend={async (text, type, file, meta) => {
                console.log('[UnifiedChat] Attempting to send message:', { type, textLength: text.length });
                try {
                  await sendMessage(text, type as any, file, meta);
                  console.log('[UnifiedChat] Message sent successfully');
                } catch (e: any) {
                  console.error('[UnifiedChat] Send message failed:', e);
                  showToast(e.message || 'Erro ao enviar mensagem', 'error');
                }
            }}
            isUploading={isUploading}
            placeholder={ticketStatus === 'CLOSED' ? 'Atendimento encerrado' : 'Digite sua mensagem...'}
            chatTheme={chatTheme}
          />
      </div>
      
      {ticketStatus === 'CLOSED' && role !== 'OPERATOR' && (
          <div className="absolute inset-x-0 bottom-32 flex justify-center px-4 pointer-events-none z-30">
              <div className="bg-amber-500/90 text-black text-[9px] font-black uppercase px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md border border-amber-400/50 flex items-center gap-2 animate-bounce">
                  <Lock size={14} /> Atendimento Encerrado para Novas Mensagens
              </div>
          </div>
      )}
    </div>
  );
}
