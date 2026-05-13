
import React, { useRef, useEffect } from 'react';
import { Phone, Video, Lock } from 'lucide-react';
import { ChatMessages } from './components/ChatMessages';
import { ChatInput } from './components/ChatInput';
import { useSupportRealtime } from './hooks/useSupportRealtime';
import { useSupportCalls } from './hooks/useSupportCalls';

interface ChatContainerProps {
  loanId: string;
  profileId: string;
  operatorId?: string;
  senderType: 'CLIENT' | 'OPERATOR';
  placeholder?: string;
  clientName?: string;
  supabaseClient?: any;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  loanId,
  profileId,
  operatorId,
  senderType,
  placeholder,
  supabaseClient,
}) => {
  const { messages, ticketStatus, isOnline, isLoading, sendMessage, updateTicketStatus, deleteMessage } =
    useSupportRealtime(loanId, profileId, senderType, supabaseClient);

  // ✅ CHAMADAS (voz/vídeo)
  const {
    uiStatus: callStatus,
    currentCall,
    remoteStream,
    localStream,
    startCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
  } = useSupportCalls({ loanId, profileId, role: senderType });

  const scrollRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [messages]);

  // bind streams (video)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const handleSend = async (text: string, type: any = 'text', file?: any, meta?: any) => {
    // upload fica em outro passo ou componente; aqui só envia texto/links/metadata
    // Se 'file' for string, passamos como fileUrl
    const fileUrl = typeof file === 'string' ? file : undefined;
    
    try {
      await sendMessage(text, type, fileUrl, meta);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Falha ao enviar mensagem');
    }
  };

  const handleReopen = () => {
    updateTicketStatus('OPEN');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-950/20 relative overflow-hidden">
      {/* Header Status - Glassmorphism design */}
      <div className="absolute top-0 right-0 left-0 p-3 flex justify-between items-center pointer-events-none z-20 px-6 pt-4 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent backdrop-blur-[2px]">
        <div className="pointer-events-auto">
          {isOnline ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/40 border border-slate-700/50">
              <span className="w-2 h-2 bg-slate-600 rounded-full"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Offline</span>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex gap-2.5">
          {ticketStatus === 'OPEN' && (
            <>
              <button
                onClick={() => startCall('VOICE')}
                className="p-2.5 bg-slate-900/60 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-400 rounded-2xl shadow-xl border border-slate-700/50 backdrop-blur-md transition-all duration-300 group"
                title="Chamada de voz"
              >
                <Phone size={18} className="group-hover:scale-110 transition-transform" />
              </button>
              <button
                onClick={() => startCall('VIDEO')}
                className="p-2.5 bg-slate-900/60 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 rounded-2xl shadow-xl border border-slate-700/50 backdrop-blur-md transition-all duration-300 group"
                title="Chamada de vídeo"
              >
                <Video size={18} className="group-hover:scale-110 transition-transform" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Overlay de chamada */}
      {callStatus !== 'IDLE' && currentCall && (
        <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="text-white font-black uppercase text-sm">
              {currentCall.call_type === 'VIDEO' ? 'Chamada de vídeo' : 'Chamada de voz'}
              <span className="ml-2 text-[10px] text-slate-400 font-bold">
                {callStatus === 'RINGING' ? 'Chamando...' : 'Em andamento'}
              </span>
            </div>

            <button
              onClick={endCall}
              className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase"
            >
              Encerrar
            </button>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 flex items-center justify-center p-4">
            {currentCall.call_type === 'VIDEO' ? (
              <div className="w-full max-w-md flex flex-col gap-3">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-2xl bg-black border border-slate-800"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-40 rounded-xl bg-black border border-slate-800 self-end -mt-28 mr-3"
                />
              </div>
            ) : (
              <div className="text-center text-white">
                <div className="text-lg font-black uppercase">
                  {callStatus === 'RINGING' ? 'Conectando...' : 'Chamada ativa'}
                </div>
                <div className="text-xs text-slate-400 font-bold mt-2">
                  Áudio em andamento
                </div>
              </div>
            )}
          </div>

          {/* Ações (callee) */}
          {callStatus === 'RINGING' && currentCall.callee_role === senderType && (
            <div className="p-4 border-t border-slate-800 flex gap-3 justify-center">
              <button
                onClick={rejectIncoming}
                className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase"
              >
                Recusar
              </button>
              <button
                onClick={acceptIncoming}
                className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase"
              >
                Aceitar
              </button>
            </div>
          )}
        </div>
      )}

      <ChatMessages
        messages={messages}
        currentUserId={profileId}
        senderType={senderType}
        operatorId={operatorId}
        scrollRef={scrollRef}
        onDeleteMessage={deleteMessage}
      />

      {ticketStatus === 'CLOSED' && (
        <div className="px-4 pb-2 text-center shrink-0">
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-xl inline-flex items-center gap-2">
            <Lock size={14} className="text-slate-500" />
            <span className="text-xs text-slate-400 font-bold uppercase">Atendimento Finalizado</span>
            {senderType === 'CLIENT' && (
              <button
                onClick={handleReopen}
                className="ml-2 text-[10px] font-black text-blue-400 hover:text-white hover:underline uppercase"
              >
                Solicitar Reabertura
              </button>
            )}
          </div>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        isUploading={false}
        placeholder={placeholder}
      />
    </div>
  );
};
