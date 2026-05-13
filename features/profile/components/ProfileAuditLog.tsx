
import React from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import { LedgerEntry } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { humanizeAuditLog } from '../../../utils/auditHelpers';
import { translateTransactionType } from '../../../utils/translationHelpers';

interface ProfileAuditLogProps {
    logs: (LedgerEntry & { clientName: string })[];
}

export const ProfileAuditLog: React.FC<ProfileAuditLogProps> = ({ logs }) => {
    const renderAuditEntry = (log: LedgerEntry & { clientName: string }) => {
        const isAudit = log.category === 'AUDIT' || log.notes?.startsWith('{');
        const lines = isAudit ? humanizeAuditLog(log.notes || '') : [log.notes || 'Operação realizada'];
  
        return (
          <div key={log.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-blue-500/50 transition-colors flex flex-col gap-3">
              <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${log.type === 'ADJUSTMENT' ? 'bg-indigo-500/10 text-indigo-400' : log.type === 'LEND_MORE' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <Activity size={18}/>
                      </div>
                      <div>
                          <p className="text-xs font-black text-white uppercase">{log.clientName}</p>
                          <p className="text-[10px] text-slate-500">{new Date(log.date).toLocaleString('pt-BR')}</p>
                      </div>
                  </div>
                  {!isAudit ? (
                      <p className={`text-sm font-black ${log.type === 'LEND_MORE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {log.type === 'LEND_MORE' ? '-' : '+'} {formatMoney(log.amount, false)}
                      </p>
                  ) : (
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black rounded uppercase">Edição de Auditoria</span>
                  )}
              </div>
              
              <div className={`p-3 rounded-xl ${isAudit ? 'bg-indigo-950/20 border border-indigo-500/20' : 'bg-slate-900/50'}`}>
                  {lines.map((line, idx) => (
                      <p key={idx} className="text-[10px] text-slate-300 leading-relaxed italic flex items-start gap-2">
                          {isAudit && <AlertCircle size={10} className="mt-0.5 flex-shrink-0"/>}
                          {line}
                      </p>
                  ))}
              </div>
          </div>
        );
    };

    return (
        <div className="animate-in slide-in-from-right space-y-6">
            <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-2xl text-xs text-blue-300 font-bold mb-4 flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/20 rounded-lg"><Activity size={16}/></div>
                Registro detalhado de alterações e transações (Compliance)
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="text-center text-slate-500 py-20 uppercase text-xs font-black tracking-widest border-2 border-dashed border-slate-800 rounded-2xl">Nenhum registro de auditoria.</div>
                ) : (
                    logs.map((log) => renderAuditEntry(log))
                )}
            </div>
        </div>
    );
};
