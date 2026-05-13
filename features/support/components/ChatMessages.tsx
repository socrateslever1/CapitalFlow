
import React, { useEffect, useRef, useState } from 'react';
import { SupportMessage } from '../../../services/supportChat.service';
import { AudioPlayer } from './AudioPlayer';
import { Check, CheckCheck, FileText, Image as ImageIcon, MapPin, User, ExternalLink, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useModal } from '../../../contexts/ModalContext';

interface ChatMessagesProps {
  messages: SupportMessage[];
  currentUserId: string;
  senderType: 'CLIENT' | 'OPERATOR';
  operatorId?: string;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onDeleteMessage?: (id: string) => void;
  chatTheme?: 'dark' | 'blue';
}

function buildMapsUrlFromMessage(m: SupportMessage): { url: string | null; lat?: number; lng?: number } {
  // 1) Prefer metadata
  const lat = (m as any)?.metadata?.lat;
  const lng = (m as any)?.metadata?.lng;

  if (typeof lat === 'number' && typeof lng === 'number') {
    return { url: `https://maps.google.com/?q=${lat},${lng}`, lat, lng };
  }

  // 2) Try extract from content: https://maps.google.com/?q=LAT,LNG
  const content = String(m.content || m.text || '').trim();
  const match = content.match(/q=([-0-9.]+),\s*([-0-9.]+)/i);
  if (match) {
    const lat2 = Number(match[1]);
    const lng2 = Number(match[2]);
    if (Number.isFinite(lat2) && Number.isFinite(lng2)) {
      return { url: `https://maps.google.com/?q=${lat2},${lng2}`, lat: lat2, lng: lng2 };
    }
  }

  // 3) If content itself is a URL, use it
  if (content.startsWith('http://') || content.startsWith('https://')) {
    return { url: content };
  }

  return { url: null };
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  currentUserId,
  senderType,
  operatorId,
  scrollRef,
  onDeleteMessage,
  chatTheme = 'dark'
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll inteligente
  useEffect(() => {
    const container = scrollRef?.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    // Se for a primeira carga (poucas mensagens) ou estiver perto do final, rola pra baixo
    if (isNearBottom || messages.length <= 20) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, scrollRef]);

  const handleDelete = (id: string) => {
    // Tenta usar o controlador de confirmação se disponível via hook
    try {
        const { loanCtrl } = useModal();
        if (loanCtrl && loanCtrl.openConfirmation) {
            loanCtrl.openConfirmation({
                type: 'DELETE_CHAT_MESSAGE',
                target: id,
                title: 'Apagar Mensagem?',
                message: 'Esta mensagem será removida permanentemente para todos.',
                onConfirm: async () => {
                    onDeleteMessage?.(id);
                }
            });
            return;
        }
    } catch (e) {
        // Fallback caso useModal falhe (fora do contexto)
        console.warn('ModalContext not available in ChatMessages');
    }

    // Se falhar o modal (ex: fora do provider), fazemos delete direto ou aviso
    // O ideal agora é que o ModalProvider envolva o Chat
    onDeleteMessage?.(id);
  };

  const renderContent = (m: SupportMessage) => {
    const effectiveType = (m.metadata?.original_type as string) || m.type;

    switch (effectiveType) {
      case 'image':
        return (
          <div className="mt-1 mb-1">
            {m.file_url ? (
              <img
                src={m.file_url}
                alt="Anexo"
                className="rounded-lg max-w-full max-h-64 object-cover border border-white/5 cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => window.open(m.file_url || '', '_blank')}
              />
            ) : (
              <div className="bg-white/5 p-4 rounded-lg flex items-center gap-2">
                <ImageIcon size={16} /> Imagem indisponível
              </div>
            )}
            {m.content && <p className="text-[10px] mt-1 opacity-70">{m.content}</p>}
          </div>
        );

      case 'audio':
        return (
          <div className="min-w-[220px]">
            {m.file_url ? (
              <AudioPlayer
                src={m.file_url}
                duration={m.metadata?.duration_ms ? m.metadata.duration_ms / 1000 : undefined}
              />
            ) : (
              <div className="bg-white/5 p-3 rounded-xl text-[10px] opacity-70">
                Áudio indisponível.
              </div>
            )}
            {m.content && <p className="text-[10px] mt-1 opacity-70">{m.content}</p>}
          </div>
        );

      case 'location': {
        const maps = buildMapsUrlFromMessage(m);
        const label =
          typeof maps.lat === 'number' && typeof maps.lng === 'number'
            ? `${maps.lat.toFixed(6)}, ${maps.lng.toFixed(6)}`
            : 'Abrir no mapa';

        if (!maps.url) {
          return (
            <div className="bg-black/20 p-3 rounded-xl min-w-[220px] border border-white/5">
              <div className="flex items-center gap-2">
                <MapPin className="text-rose-400" size={18} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">Localização</p>
                  <p className="text-[9px] opacity-70">Indisponível (sem link/coords)</p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <a
            href={maps.url}
            target="_blank"
            rel="noreferrer"
            className="block bg-black/20 p-3 rounded-xl min-w-[220px] border border-white/5 hover:bg-black/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MapPin className="text-rose-400" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white">Localização</p>
                <p className="text-[9px] opacity-70 truncate">{label}</p>
              </div>
              <ExternalLink size={14} className="opacity-70" />
            </div>

            <div className="mt-2 text-[9px] font-black uppercase tracking-wider text-rose-200/80">
              📍 Ver no mapa
            </div>
          </a>
        );
      }

      case 'file':
        return (
          <a
            href={m.file_url || '#'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 bg-black/10 p-3 rounded-xl min-w-[200px] hover:bg-black/20 transition-colors"
          >
            <FileText size={20} className="shrink-0 text-blue-300" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">
                {m.content?.replace('📎 Arquivo: ', '') || 'Documento'}
              </p>
              <p className="text-[9px] opacity-70 uppercase font-black text-blue-200">Baixar</p>
            </div>
          </a>
        );

      default:
        return (
          <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
            {m.content || (m as any).text}
          </p>
        );
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-2 min-h-0" ref={scrollRef}>
      {messages.map((m, index) => {
        const isMe = m.sender_type === senderType;
        const prevM = messages[index - 1];
        
        // Verifica se mudou o dia para inserir o separador
        const currentDate = new Date(m.created_at);
        const prevDate = prevM ? new Date(prevM.created_at) : null;
        const isNewDay = !prevDate || currentDate.toDateString() !== prevDate.toDateString();

        const isSequence = prevM && prevM.sender_type === m.sender_type && !isNewDay;

        return (
          <React.Fragment key={m.id}>
            {isNewDay && (
              <div className="flex justify-center my-6">
                <div className="bg-slate-900/50 border border-slate-800/50 px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
                    {currentDate.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' })}
                  </span>
                </div>
              </div>
            )}
            
            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSequence ? 'mt-1' : 'mt-4'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 shadow-xl transition-all hover:scale-[1.01] ${
                  isMe
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl rounded-tr-sm'
                    : `${chatTheme === 'blue' ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-slate-800/90 border border-slate-700/30'} text-slate-100 rounded-2xl rounded-tl-sm backdrop-blur-sm`
                }`}
              >
                <div className="relative">
                  {renderContent(m)}
                </div>

                <div
                  className={`flex items-center justify-end gap-1.5 mt-1.5 text-[8px] font-black uppercase tracking-tighter ${
                    isMe ? 'text-blue-100/60' : 'text-slate-500'
                  }`}
                >
                  {/* Botão de Deletar para Operador */}
                  {senderType === 'OPERATOR' && onDeleteMessage && (
                      <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }} 
                          className="mr-2 opacity-0 group-hover:opacity-100 transition-all hover:text-rose-400"
                          title="Apagar Mensagem"
                      >
                          <Trash2 size={10} />
                      </button>
                  )}

                  <span className="tabular-nums">
                      {currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {m.sender_type === 'OPERATOR' && m.operator_id && !isMe && (
                    <div className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                      <ShieldCheck size={8} />
                      <span>Oficial</span>
                    </div>
                  )}

                  {isMe && (
                      <div className="ml-1 flex">
                          {m.read ? (
                              <CheckCheck size={10} className="text-emerald-400" />
                          ) : (
                              <Check size={10} className="text-blue-200/50" />
                          )}
                      </div>
                  )}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
};
