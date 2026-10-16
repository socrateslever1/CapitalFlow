import React, { useState } from 'react';
import {
  Clock, User, Search, Trash2, Edit2, X, MessageCircle, Check
} from 'lucide-react';
import { ReminderItem, ReminderStatus } from '../types';
import { Client } from '../../../types';
import { AudioPlayer } from './AudioPlayer';
import { getThemeById } from '../themes/reminderThemes';
import { Modal, modalPrimaryActionClass } from '../../../components/ui/Modal';

interface ReminderManagerModalProps {
  reminders: ReminderItem[];
  clients?: Client[];
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (item: ReminderItem) => void;
  onTriggerAlertPreview: (item: ReminderItem) => void;
  onClose: () => void;
}

export const ReminderManagerModal: React.FC<ReminderManagerModalProps> = ({
  reminders,
  clients = [],
  onToggleComplete,
  onDelete,
  onOpenCreate,
  onOpenEdit,
  onTriggerAlertPreview,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'TODAY' | 'UPCOMING' | 'COMPLETED'>('TODAY');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Categorização
  const todayReminders = reminders.filter(r => {
    if (r.status === 'COMPLETED') return false;
    return r.dueDate <= todayStr;
  });

  const upcomingReminders = reminders.filter(r => {
    if (r.status === 'COMPLETED') return false;
    return r.dueDate > todayStr;
  });

  const completedReminders = reminders.filter(r => r.status === 'COMPLETED');

  // Filtro de busca
  const currentList = (
    activeTab === 'TODAY'
      ? todayReminders
      : activeTab === 'UPCOMING'
      ? upcomingReminders
      : completedReminders
  ).filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.title.toLowerCase().includes(term) ||
      (r.description && r.description.toLowerCase().includes(term)) ||
      (r.clientName && r.clientName.toLowerCase().includes(term))
    );
  });

  const formatDateTime = (dateStr: string, timeStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      const isToday = dateStr === todayStr;
      return `${isToday ? 'Hoje' : `${d}/${m}`} às ${timeStr}`;
    } catch {
      return `${dateStr} às ${timeStr}`;
    }
  };

  const isOverdue = (r: ReminderItem) => {
    if (r.status === 'COMPLETED') return false;
    return new Date(r.scheduledAt).getTime() < now.getTime();
  };

  return (
    <>
      <Modal
        onClose={onClose}
        title="Central de Tarefas"
        size="md"
        footer={<button type="button" onClick={onOpenCreate} className={modalPrimaryActionClass}>Novo lembrete</button>}
      >
          <div className="space-y-2">
            {/* Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('TODAY')}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
                  activeTab === 'TODAY'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Hoje</span>
                {todayReminders.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                    {todayReminders.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('UPCOMING')}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
                  activeTab === 'UPCOMING'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Próximos</span>
                {upcomingReminders.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-300">
                    {upcomingReminders.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('COMPLETED')}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
                  activeTab === 'COMPLETED'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Concluídos</span>
                {completedReminders.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400">
                    {completedReminders.length}
                  </span>
                )}
              </button>
            </div>

            {/* Input de Pesquisa */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar lembretes"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 transition-colors focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Lista de Lembretes */}
          <div className="mt-2 space-y-2">
            {currentList.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center space-y-2 rounded-lg border border-slate-800/70 bg-slate-950/35 p-5 text-center text-slate-500">
                <div>
                  <h4 className="text-sm font-bold text-white">Nenhum lembrete nesta aba</h4>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                    {activeTab === 'TODAY'
                      ? 'Nenhuma tarefa pendente para hoje ou atrasada. Parabéns!'
                      : activeTab === 'UPCOMING'
                      ? 'Nenhum lembrete agendado para os próximos dias.'
                      : 'Você ainda não concluiu nenhuma tarefa.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenCreate}
                  className="rounded-lg border border-blue-500/30 bg-blue-600/20 px-4 py-2 text-xs font-bold text-blue-400 transition-colors hover:bg-blue-600/30"
                >
                  Criar Primeiro Lembrete
                </button>
              </div>
            ) : (
              currentList.map((item) => {
                const overdue = isOverdue(item);
                const isCompleted = item.status === 'COMPLETED';

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isCompleted
                        ? 'bg-slate-950/40 border-slate-800/50 opacity-70'
                        : overdue
                        ? 'bg-gradient-to-r from-rose-950/20 to-slate-900 border-rose-500/30 shadow-sm shadow-rose-950/50'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Checkbox de Conclusão */}
                      <button
                        type="button"
                        onClick={() => onToggleComplete(item.id)}
                        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                          isCompleted
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/30'
                            : 'border-slate-700 hover:border-emerald-500 text-transparent hover:text-emerald-400 bg-slate-900'
                        }`}
                        title={isCompleted ? 'Marcar como pendente' : 'Marcar como concluída'}
                      >
                        <Check size={12} className="stroke-[3]" />
                      </button>

                      {/* Conteúdo */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3
                            className={`text-xs font-bold tracking-tight ${
                              isCompleted ? 'line-through text-slate-500' : 'text-white'
                            }`}
                          >
                            {item.title}
                          </h3>

                          <div className="flex items-center gap-1">
                            {/* Horário */}
                            <span
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                isCompleted
                                  ? 'bg-slate-800 text-slate-400'
                                  : overdue
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              <Clock size={11} />
                              {formatDateTime(item.dueDate, item.dueTime)}
                            </span>

                            {/* Prioridade */}
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                item.priority === 'ALTA'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : item.priority === 'MEDIA'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {item.priority}
                            </span>

                            {/* Tema e Meme */}
                            {item.themeId && (() => {
                              const t = getThemeById(item.themeId);
                              return t ? (
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-slate-900 border border-slate-700/80 ${t.accentTextColor}`} title={t.name}>
                                  {t.badge}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </div>

                        {/* Descrição */}
                        {item.description && (
                          <p
                            className={`text-xs leading-relaxed whitespace-pre-wrap ${
                              isCompleted ? 'text-slate-600' : 'text-slate-400'
                            }`}
                          >
                            {item.description}
                          </p>
                        )}

                        {/* Cliente Marcado */}
                        {(item.clientName || item.clientId) && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-950/50 px-2 py-0.5 text-[11px] font-bold text-blue-300">
                              <User size={12} className="text-blue-400" />
                              <span>@{item.clientName || 'Cliente'}</span>
                            </span>

                            {item.clientPhone && (
                              <a
                                href={`https://wa.me/55${item.clientPhone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-bold text-emerald-400 transition-colors hover:bg-emerald-950/70"
                              >
                                <MessageCircle size={12} />
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Anexos: Áudio e Imagem */}
                        {(item.audioUrl || item.imageUrl) && (
                          <div className="pt-2 space-y-2">
                            {item.audioUrl && (
                              <AudioPlayer src={item.audioUrl} duration={item.audioDuration} compact />
                            )}

                            {item.imageUrl && (
                              <div
                                onClick={() => setSelectedImagePreview(item.imageUrl!)}
                                className="cursor-pointer inline-flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                              >
                                <img
                                  src={item.imageUrl}
                                  alt="Miniatura"
                                  className="w-10 h-10 object-cover rounded-lg"
                                />
                                <span className="text-[11px] font-bold text-slate-300 pr-2">
                                  Ver Imagem Anexa
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Botões de Ação */}
                        <div className="flex items-center justify-between border-t border-slate-900/60 pt-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onTriggerAlertPreview(item)}
                              className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline uppercase tracking-wider"
                              title="Testar como a tela de alerta abrirá no horário"
                            >
                              Ver Alerta na Tela
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenEdit(item)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                              title="Editar lembrete"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Excluir lembrete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
      </Modal>

      {/* Lightbox para Imagem Preview */}
      {selectedImagePreview && (
        <div
          className="fixed inset-0 z-[10600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg"
          onClick={() => setSelectedImagePreview(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-700">
            <button
              onClick={() => setSelectedImagePreview(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
            <img src={selectedImagePreview} alt="Visualização" className="max-w-full max-h-[80vh] object-contain" />
          </div>
        </div>
      )}
    </>
  );
};
