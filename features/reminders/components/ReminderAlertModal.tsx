import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, Clock, X, MessageCircle, Calendar, AlertTriangle, Image as ImageIcon, Volume2, ArrowRight } from 'lucide-react';
import { ReminderItem } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { getThemeById } from '../themes/reminderThemes';

interface ReminderAlertModalProps {
  reminder: ReminderItem | null;
  onComplete: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: () => void;
  onOpenClientProfile?: (clientId: string) => void;
}

export const ReminderAlertModal: React.FC<ReminderAlertModalProps> = ({
  reminder,
  onComplete,
  onSnooze,
  onDismiss,
  onOpenClientProfile,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!reminder) return null;

  const theme = getThemeById(reminder.themeId);

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'ALTA':
        return 'bg-rose-500/15 border-rose-500/30 text-rose-400';
      case 'MEDIA':
        return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
      default:
        return 'bg-blue-500/15 border-blue-500/30 text-blue-400';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'COBRANCA': return 'Cobrança';
      case 'RETORNO': return 'Retorno';
      case 'DOCUMENTO': return 'Documento';
      case 'REUNIAO': return 'Reunião';
      default: return 'Geral';
    }
  };

  // Formata data e horário para exibição
  const formatScheduledTime = () => {
    try {
      const [year, month, day] = reminder.dueDate.split('-');
      return `${day}/${month}/${year} às ${reminder.dueTime}`;
    } catch {
      return `${reminder.dueDate} às ${reminder.dueTime}`;
    }
  };

  const cleanPhone = reminder.clientPhone?.replace(/\D/g, '');
  const whatsappUrl = cleanPhone
    ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá ${reminder.clientName || ''}, referente ao lembrete: ${reminder.title}`)}`
    : null;

  return (
    <>
      <div className="fixed inset-0 z-[10500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className={`relative w-full max-w-lg ${
            theme
              ? `bg-gradient-to-b ${theme.bgGradient} border-2 ${theme.borderColor}`
              : 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/50'
          } rounded-3xl overflow-hidden`}
          style={{
            boxShadow: theme
              ? `0 0 60px -10px ${theme.glowColor}`
              : '0 0 50px -10px rgba(245,158,11,0.35)',
          }}
        >
          {/* Faixa superior de destaque de alerta */}
          <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 px-6 py-4 border-b border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20 animate-bounce">
                <Bell size={20} className="fill-amber-400" />
              </div>
              <div>
                <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Alerta de Lembrete no Horário
                </span>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock size={13} className="text-amber-400" />
                  {formatScheduledTime()}
                </h3>
              </div>
            </div>

            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors"
              title="Fechar alerta"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Destaque do Meme / Tema Personalizado se selecionado */}
            {theme && (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 flex items-center gap-3.5 shadow-xl">
                <div className="relative shrink-0">
                  <img
                    src={theme.imageUrl}
                    alt={theme.name}
                    className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-lg"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="absolute -bottom-1 -right-1 text-xs">🎭</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${theme.accentTextColor}`}>
                    {theme.badge}
                  </span>
                  <p className="text-xs text-slate-200 font-semibold italic mt-0.5 leading-snug">
                    {theme.humorQuote}
                  </p>
                </div>
              </div>
            )}

            {/* Tags de Categoria e Prioridade */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border tracking-wider ${getPriorityStyle(reminder.priority)}`}>
                Prioridade {reminder.priority}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                {getCategoryLabel(reminder.category)}
              </span>
            </div>

            {/* Título e Descrição */}
            <div>
              <h2 className="text-xl font-black text-white tracking-tight leading-snug">
                {reminder.title}
              </h2>
              {reminder.description && (
                <p className="mt-2 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-800/40 border border-slate-800 rounded-2xl p-3.5">
                  {reminder.description}
                </p>
              )}
            </div>

            {/* Cliente Marcado (@Fulano) */}
            {(reminder.clientName || reminder.clientId) && (
              <div className="bg-gradient-to-r from-blue-950/40 to-slate-900 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-300 font-black text-sm shrink-0">
                    {reminder.clientName ? reminder.clientName.substring(0, 2).toUpperCase() : '@'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider block">
                      Cliente Marcado
                    </span>
                    <h4 className="text-sm font-bold text-white truncate">
                      @{reminder.clientName || 'Cliente'}
                    </h4>
                    {reminder.clientPhone && (
                      <span className="text-xs text-slate-400 font-mono block">
                        {reminder.clientPhone}
                      </span>
                    )}
                  </div>
                </div>

                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 shrink-0"
                  >
                    <MessageCircle size={15} />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            )}

            {/* Áudio anexado */}
            {reminder.audioUrl && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Volume2 size={13} className="text-blue-400" />
                  Áudio do Lembrete
                </label>
                <AudioPlayer src={reminder.audioUrl} duration={reminder.audioDuration} />
              </div>
            )}

            {/* Imagem anexada */}
            {reminder.imageUrl && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ImageIcon size={13} className="text-amber-400" />
                  Imagem Anexada
                </label>
                <div
                  onClick={() => setSelectedImage(reminder.imageUrl!)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 max-h-48 flex items-center justify-center shadow-lg"
                >
                  <img
                    src={reminder.imageUrl}
                    alt={reminder.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                    Clique para ampliar
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé com Ações */}
          <div className="p-4 bg-slate-950/90 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={() => onComplete(reminder.id)}
              className={`w-full sm:flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r ${
                theme ? theme.buttonGradient : 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
              } text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98`}
            >
              <CheckCircle2 size={18} />
              <span>Marcar como Concluída</span>
            </button>

            <div className="w-full sm:w-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSnooze(reminder.id, 10)}
                className="flex-1 sm:flex-none py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
                title="Lembrar novamente em 10 minutos"
              >
                +10 min
              </button>
              <button
                type="button"
                onClick={() => onSnooze(reminder.id, 60)}
                className="flex-1 sm:flex-none py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
                title="Lembrar novamente em 1 hora"
              >
                +1 hora
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 sm:flex-none py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold border border-slate-800 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Lightbox para Imagem Completa */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[10600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700 shadow-2xl">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
            <img src={selectedImage} alt="Visualização ampliada" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}
    </>
  );
};
