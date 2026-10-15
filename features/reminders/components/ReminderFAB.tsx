import React from 'react';
import { Bell, Clock } from 'lucide-react';

interface ReminderFABProps {
  dueCount: number;
  overdueCount: number;
  brandColor?: string;
  onClick: () => void;
}

export const ReminderFAB: React.FC<ReminderFABProps> = ({
  dueCount,
  overdueCount,
  brandColor,
  onClick,
}) => {
  const primaryColor = brandColor || '#2563eb';
  const hasAlerts = overdueCount > 0;

  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 relative flex items-center justify-center text-white rounded-full shadow-2xl hover:scale-110 transition-all active:scale-95 group ${
        hasAlerts ? 'animate-bounce' : ''
      }`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
        boxShadow: hasAlerts
          ? `0 10px 25px -5px rgba(244, 63, 94, 0.5)`
          : `0 10px 25px -5px ${primaryColor}66`,
      }}
      title="Lembretes & Tarefas"
    >
      <Bell size={20} className={hasAlerts ? 'fill-rose-300' : ''} />

      {dueCount > 0 && (
        <span
          className={`absolute -top-1 -right-1 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ring-4 ring-slate-950 ${
            hasAlerts ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
          }`}
        >
          {dueCount > 99 ? '99+' : dueCount}
        </span>
      )}

      <span className="absolute right-full mr-4 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-2xl">
        Lembretes & Tarefas
      </span>
    </button>
  );
};
