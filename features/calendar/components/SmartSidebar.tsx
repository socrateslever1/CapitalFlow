
import React from 'react';
import { CalendarEvent } from '../types';
import { AlertCircle, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';

interface SmartSidebarProps {
    events: CalendarEvent[];
    onAction: (event: CalendarEvent) => void;
    currentDate: Date;
}

export const SmartSidebar: React.FC<SmartSidebarProps> = ({ events, onAction, currentDate }) => {
    const todayStr = new Date().toDateString();
    
    // Filtros
    const urgentEvents = events.filter(e => e.priority === 'URGENT');
    const lateEvents = events.filter(e => e.status === 'LATE');
    const todayEvents = events.filter(e => {
        const d = new Date(e.start_time);
        return d.toDateString() === todayStr && e.priority !== 'URGENT' && e.status !== 'LATE';
    });

    const renderCard = (e: CalendarEvent, badge?: string) => (
        <div key={e.id} onClick={() => onAction(e)} className={`p-3 rounded-xl border mb-2 cursor-pointer transition-all active:scale-95 group ${e.priority === 'URGENT' ? 'bg-emerald-950/30 border-emerald-500/50 hover:bg-emerald-900/40' : e.status === 'LATE' ? 'bg-rose-950/20 border-rose-500/30 hover:bg-rose-900/30' : 'bg-slate-900 border-slate-800 hover:border-blue-500'}`}>
            <div className="flex justify-between items-start">
                <h4 className="text-xs font-bold text-white line-clamp-1">{e.title}</h4>
                {badge && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${e.priority === 'URGENT' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'}`}>{badge}</span>}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{e.description || 'Sem detalhes'}</p>
            <div className="flex items-center gap-1 mt-2 text-[9px] font-bold uppercase text-slate-500">
                {e.type === 'SYSTEM_INSTALLMENT' && <Clock size={10}/>}
                {e.type === 'SYSTEM_PORTAL_REQUEST' && <ShieldAlert size={10} className="text-emerald-500"/>}
                <span>{new Date(e.start_time).toLocaleDateString()}</span>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-slate-950/50 border-l border-slate-800 p-4 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">Painel de Comando</h3>

            {urgentEvents.length > 0 && (
                <div className="mb-6">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase mb-2 flex items-center gap-1"><ShieldAlert size={12}/> Atenção do Portal ({urgentEvents.length})</p>
                    {urgentEvents.map(e => renderCard(e, 'Ação'))}
                </div>
            )}

            {lateEvents.length > 0 && (
                <div className="mb-6">
                    <p className="text-[10px] font-bold text-rose-500 uppercase mb-2 flex items-center gap-1"><AlertCircle size={12}/> Atrasados ({lateEvents.length})</p>
                    {lateEvents.slice(0, 5).map(e => renderCard(e))}
                    {lateEvents.length > 5 && <p className="text-[9px] text-center text-slate-500 cursor-pointer hover:text-slate-400">Ver mais {lateEvents.length - 5}...</p>}
                </div>
            )}

            <div className="mb-4">
                <p className="text-[10px] font-bold text-blue-500 uppercase mb-2 flex items-center gap-1"><CheckCircle2 size={12}/> Agenda de Hoje</p>
                {todayEvents.length === 0 ? <p className="text-[10px] text-slate-500 italic">Nada agendado para hoje.</p> : todayEvents.map(e => renderCard(e))}
            </div>
        </div>
    );
};
