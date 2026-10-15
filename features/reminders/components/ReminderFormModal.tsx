import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, Clock, User, Image as ImageIcon, Sparkles, Check, AlertCircle, Trash2, Tag } from 'lucide-react';
import { ReminderFormData, ReminderItem, ReminderPriority, ReminderCategory } from '../types';
import { Client } from '../../../types';
import { AudioRecorder } from './AudioRecorder';
import { ThemeSelector } from './ThemeSelector';
import { compressAndConvertToBase64 } from '../services/reminder.service';

interface ReminderFormModalProps {
  initialData?: ReminderItem | null;
  clients?: Client[];
  onSave: (data: ReminderFormData) => void;
  onClose: () => void;
}

export const ReminderFormModal: React.FC<ReminderFormModalProps> = ({
  initialData,
  clients = [],
  onSave,
  onClose,
}) => {
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDefaultTimeStr = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [dueDate, setDueDate] = useState(initialData?.dueDate || getTodayStr());
  const [dueTime, setDueTime] = useState(initialData?.dueTime || getDefaultTimeStr());
  const [priority, setPriority] = useState<ReminderPriority>(initialData?.priority || 'MEDIA');
  const [category, setCategory] = useState<ReminderCategory>(initialData?.category || 'GERAL');
  const [themeId, setThemeId] = useState<string | undefined>(initialData?.themeId);

  // Cliente marcado
  const [selectedClient, setSelectedClient] = useState<{ id?: string; name?: string; phone?: string }>({
    id: initialData?.clientId,
    name: initialData?.clientName,
    phone: initialData?.clientPhone,
  });
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Anexos
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialData?.imageUrl);
  const [imageName, setImageName] = useState<string | undefined>(initialData?.imageName);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(initialData?.audioUrl);
  const [audioDuration, setAudioDuration] = useState<number | undefined>(initialData?.audioDuration);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Filtra clientes pelo termo digitado
  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true;
    const s = clientSearch.toLowerCase();
    return c.name.toLowerCase().includes(s) || (c.document && c.document.includes(s)) || (c.phone && c.phone.includes(s));
  }).slice(0, 6);

  const handleSelectClient = (c: Client) => {
    setSelectedClient({
      id: c.id,
      name: c.name,
      phone: c.phone,
    });
    setClientSearch('');
    setShowClientDropdown(false);

    // Se o título estiver vazio, sugere um título com o nome do cliente
    if (!title) {
      setTitle(`Lembrete para @${c.name}`);
    }
  };

  const handleRemoveClient = () => {
    setSelectedClient({});
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, selecione uma imagem válida (PNG, JPG, WEBP).');
      return;
    }

    setIsProcessingImage(true);
    try {
      const base64 = await compressAndConvertToBase64(file);
      setImageUrl(base64);
      setImageName(file.name);
    } catch {
      setErrorMsg('Falha ao processar a imagem.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Suporte a colar imagem (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          setIsProcessingImage(true);
          try {
            const base64 = await compressAndConvertToBase64(file);
            setImageUrl(base64);
            setImageName('imagem_colada.jpg');
          } catch {
            setErrorMsg('Erro ao colar imagem.');
          } finally {
            setIsProcessingImage(false);
          }
        }
        break;
      }
    }
  };

  // Quick date chips
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setDueDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  // Quick time chips
  const setQuickTime = (minutesOffset: number) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesOffset);
    setDueTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Informe um título para o lembrete.');
      return;
    }

    if (!dueDate || !dueTime) {
      setErrorMsg('Defina a data e o horário do lembrete.');
      return;
    }

    onSave({
      title: title.trim(),
      description: description.trim(),
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientPhone: selectedClient.phone,
      dueDate,
      dueTime,
      priority,
      category,
      themeId,
      imageUrl,
      imageName,
      audioUrl,
      audioDuration,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[10500] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onPaste={handlePaste}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
          <div>
            <span className="text-[10px] font-black tracking-widest text-blue-400 uppercase">
              {initialData ? 'Editar Lembrete' : 'Novo Lembrete & Tarefa'}
            </span>
            <h2 className="text-lg font-black text-white">
              {initialData ? 'Atualizar Detalhes' : 'Agendar Lembrete na Tela'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-2xl text-xs">
              <AlertCircle size={15} className="shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Título da Tarefa / Lembrete *</span>
              <span className="text-[10px] text-slate-500 lowercase">obrigatório</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => { setTitle(e.target.value); setErrorMsg(null); }}
              placeholder="Ex: Cobrar promissória, Retornar ligação, Enviar contrato..."
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Cliente Vinculado (@cliente) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-blue-400" />
                Marcar Cliente (@fulano)
              </span>
              <span className="text-[10px] text-slate-500">opcional</span>
            </label>

            {selectedClient.name ? (
              <div className="flex items-center justify-between p-3 bg-blue-950/30 border border-blue-500/30 rounded-2xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-blue-600/40 text-blue-300 font-bold flex items-center justify-center text-xs">
                    @
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-white block truncate">
                      @{selectedClient.name}
                    </span>
                    {selectedClient.phone && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {selectedClient.phone}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveClient}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Desvincular cliente"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch}
                  onFocus={() => setShowClientDropdown(true)}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowClientDropdown(true);
                  }}
                  placeholder="Digite @ ou o nome do cliente..."
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />

                {showClientDropdown && filteredClients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-800/60 max-h-48 overflow-y-auto">
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectClient(c)}
                        className="w-full text-left p-2.5 hover:bg-blue-600/10 flex items-center justify-between transition-colors group"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block group-hover:text-blue-400 truncate">
                            @{c.name}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {c.phone || c.document || 'Sem telefone'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-blue-400 opacity-0 group-hover:opacity-100 uppercase tracking-widest">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data e Horário com atalhos rápidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Marcador de Data */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Calendar size={13} className="text-amber-400" />
                Data do Lembrete *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  Amanhã
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(3)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  +3 dias
                </button>
              </div>
            </div>

            {/* Marcador de Horário Específico */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Clock size={13} className="text-blue-400" />
                Horário Específico *
              </label>
              <input
                type="time"
                required
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickTime(15)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  +15m
                </button>
                <button
                  type="button"
                  onClick={() => setQuickTime(30)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  +30m
                </button>
                <button
                  type="button"
                  onClick={() => setQuickTime(60)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  +1h
                </button>
                <button
                  type="button"
                  onClick={() => setDueTime('14:00')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700"
                >
                  14:00
                </button>
              </div>
            </div>
          </div>

          {/* Prioridade e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Prioridade
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['BAIXA', 'MEDIA', 'ALTA'] as ReminderPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                      priority === p
                        ? p === 'ALTA'
                          ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30'
                          : p === 'MEDIA'
                            ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-600/30'
                            : 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {p === 'ALTA' ? 'Alta' : p === 'MEDIA' ? 'Média' : 'Baixa'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Tag size={13} className="text-slate-400" />
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ReminderCategory)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="GERAL">Geral</option>
                <option value="COBRANCA">Cobrança</option>
                <option value="RETORNO">Retorno</option>
                <option value="DOCUMENTO">Documento / Assinatura</option>
                <option value="REUNIAO">Reunião / Atendimento</option>
              </select>
            </div>
          </div>

          {/* Seletor de Tema e Memes de Alerta */}
          <ThemeSelector
            selectedThemeId={themeId}
            onSelectTheme={setThemeId}
          />

          {/* Descrição / Anotações */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Descrição e Anotações
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Escreva detalhes da tarefa, anotações ou passos a seguir..."
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
            />
          </div>

          {/* Gravação / Anexo de Áudio */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Recado em Áudio
            </label>
            <AudioRecorder
              initialAudioUrl={audioUrl}
              initialDuration={audioDuration}
              onAudioChange={(url, dur) => {
                setAudioUrl(url);
                setAudioDuration(dur);
              }}
            />
          </div>

          {/* Anexo de Imagem */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ImageIcon size={13} className="text-amber-400" />
                Anexo de Imagem
              </span>
              <span className="text-[10px] text-slate-500">ou cole com Ctrl+V</span>
            </label>

            {imageUrl ? (
              <div className="relative rounded-2xl border border-slate-700 overflow-hidden bg-slate-950 p-2 flex items-center gap-3">
                <img
                  src={imageUrl}
                  alt="Anexo"
                  className="w-16 h-16 object-cover rounded-xl border border-slate-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white block truncate">
                    {imageName || 'Imagem anexada'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold block">
                    ✓ Pronta para salvar
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { setImageUrl(undefined); setImageName(undefined); }}
                  className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors"
                  title="Remover imagem"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  disabled={isProcessingImage}
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-dashed border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <ImageIcon size={16} className="text-amber-400" />
                  <span>{isProcessingImage ? 'Processando imagem...' : 'Clique para selecionar imagem ou foto'}</span>
                </button>
                <input
                  type="file"
                  ref={imageInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileChange}
                />
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-transform active:scale-98"
          >
            <Check size={16} />
            <span>{initialData ? 'Atualizar Lembrete' : 'Salvar Lembrete'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
