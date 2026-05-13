
import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Tag, Flag, CheckCircle, AlignLeft } from 'lucide-react';
import { CalendarEvent } from '../types';
import { Modal } from '../../../components/ui/Modal';

interface EventModalProps {
  onClose: () => void;
  onSave: (event: Partial<CalendarEvent>) => void;
  initialData?: CalendarEvent | null;
  selectedDate?: Date;
}

export const EventModal: React.FC<EventModalProps> = ({ onClose, onSave, initialData, selectedDate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [type, setType] = useState<'TASK' | 'MEETING' | 'REMINDER'>('TASK');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description || '');
      
      // CORREÇÃO FUSO HORÁRIO: Ao editar, precisamos da data LOCAL, não UTC.
      // O input type="date" espera YYYY-MM-DD.
      // toISOString() retorna UTC. Ex: 20:00 no Brasil vira 23:00 ou 00:00 do dia seguinte em UTC.
      const d = new Date(initialData.start_time);
      // Hack seguro para obter YYYY-MM-DD local
      const localIso = d.toLocaleDateString('sv-SE'); // Formato ISO local (YYYY-MM-DD) suportado por todos browsers modernos
      setDate(localIso);
      
      setTime(d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
      setPriority(initialData.priority as any);
      setType(initialData.type as any);
    } else if (selectedDate) {
      // Mesma correção para data selecionada no calendário
      const localDate = new Date(selectedDate.getTime() - (selectedDate.getTimezoneOffset() * 60000));
      setDate(localDate.toISOString().split('T')[0]);
    } else {
        // Fallback para hoje local
        const now = new Date();
        const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
        setDate(localNow.toISOString().split('T')[0]);
    }
  }, [initialData, selectedDate]);

  const handleSubmit = () => {
    if (!title) return alert('Título é obrigatório');
    
    // Combina data e hora para criar o timestamp final
    // O construtor new Date("YYYY-MM-DDTHH:mm:ss") cria data local no browser
    const combinedDate = new Date(`${date}T${time}:00`);
    
    onSave({
        title,
        description,
        start_time: combinedDate.toISOString(),
        end_time: combinedDate.toISOString(),
        is_all_day: false,
        priority,
        type,
        status: initialData?.status || 'PENDING'
    });
    onClose();
  };

  return (
    <Modal onClose={onClose} title={initialData ? 'Editar Tarefa' : 'Nova Tarefa'}>
      <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] px-1 custom-scrollbar">
        {/* Título Principal */}
        <div className="relative">
            <input 
              type="text" 
              placeholder="O que precisa ser feito?" 
              className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3 text-lg font-bold text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-500"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
        </div>
        
        {/* Grid de Controles Compactos */}
        <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col relative group focus-within:border-blue-500 transition-colors">
                <label className="text-[9px] font-black uppercase text-slate-500 mb-1 ml-1">Data</label>
                <input 
                    type="date" 
                    className="bg-transparent text-white text-xs font-bold outline-none w-full appearance-none relative z-10"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                />
                <Calendar size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none"/>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col relative group focus-within:border-blue-500 transition-colors">
                <label className="text-[9px] font-black uppercase text-slate-500 mb-1 ml-1">Hora</label>
                <input 
                    type="time" 
                    className="bg-transparent text-white text-xs font-bold outline-none w-full appearance-none relative z-10"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                />
                <Clock size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none"/>
            </div>
            
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col relative group focus-within:border-blue-500 transition-colors">
                <label className="text-[9px] font-black uppercase text-slate-500 mb-1 ml-1">Prioridade</label>
                <select 
                    className="bg-transparent text-white text-xs font-bold outline-none w-full appearance-none relative z-10"
                    value={priority}
                    onChange={e => setPriority(e.target.value as any)}
                >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                </select>
                <Flag size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none"/>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col relative group focus-within:border-blue-500 transition-colors">
                <label className="text-[9px] font-black uppercase text-slate-500 mb-1 ml-1">Tipo</label>
                <select 
                    className="bg-transparent text-white text-xs font-bold outline-none w-full appearance-none relative z-10"
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                >
                    <option value="TASK">Tarefa</option>
                    <option value="MEETING">Reunião</option>
                    <option value="REMINDER">Lembrete</option>
                </select>
                <Tag size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none"/>
            </div>
        </div>

        {/* Detalhes */}
        <div className="relative group">
            <textarea 
                placeholder="Detalhes adicionais..." 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-xs leading-relaxed h-24 resize-none outline-none focus:border-blue-500 transition-colors"
                value={description}
                onChange={e => setDescription(e.target.value)}
            />
            <AlignLeft size={14} className="absolute right-3 top-3 text-slate-500 pointer-events-none group-focus-within:text-blue-500 transition-colors"/>
        </div>

        {/* Ações */}
        <div className="flex gap-3 mt-2">
            {initialData && (
                <button 
                    onClick={() => { onSave({...initialData, status: 'DONE'}); onClose(); }}
                    className="flex-1 py-3 bg-emerald-900/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-black uppercase hover:bg-emerald-900/40 transition-colors flex items-center justify-center gap-2"
                >
                    <CheckCircle size={16}/> Feito
                </button>
            )}
            <button onClick={handleSubmit} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all active:scale-95">
                {initialData ? 'Salvar Alterações' : 'Criar Tarefa'}
            </button>
        </div>
      </div>
    </Modal>
  );
};
