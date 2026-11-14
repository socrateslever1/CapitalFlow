
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
        const isCapitalOutflow = log.type === 'LEND_MORE' || log.type === 'NOVO_APORTE';
        const lines = isAudit ? humanizeAuditLog(log.notes || '') : [log.notes || 'Operação realizada'];

        return (
          <div key={log.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors flex flex-col gap-2.5">
              <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${log.type === 'ADJUSTMENT' ? 'bg-indigo-500/10 text-indigo-400' : isCapitalOutflow ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          <Activity size={16}/>
                      </div>
                      <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{log.clientName}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">{new Date(log.date).toLocaleString('pt-BR')}</p>
                      </div>
                  </div>
                  {!isAudit ? (
                      <p className={`text-sm font-bold tabular-nums shrink-0 ${isCapitalOutflow ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {isCapitalOutflow ? '-' : '+'} {formatMoney(log.amount, false)}
                      </p>
                  ) : (
                      <span className="px-2 py-0.5 bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 text-[10px] font-semibold rounded shrink-0">Edição de Auditoria</span>
                  )}
              </div>

              <div className={`px-3 py-2 rounded-lg ${isAudit ? 'bg-indigo-950/20 border border-indigo-500/20' : 'bg-slate-900/60 border border-slate-800/60'}`}>
                  {lines.map((line, idx) => (
                      <p key={idx} className="text-xs text-slate-300 leading-snug flex items-start gap-2">
                          {isAudit && <AlertCircle size={12} className="mt-0.5 shrink-0 text-indigo-400"/>}
                          <span>{line}</span>
                      </p>
                  ))}
              </div>
          </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="bg-blue-900/15 border border-blue-500/25 px-3.5 py-2.5 rounded-lg text-xs text-blue-300 font-semibold flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-500/20 rounded-md shrink-0"><Activity size={15}/></div>
                <span>Registro detalhado de alterações e transações (Compliance)</span>
            </div>
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="text-center text-slate-400 py-14 text-xs font-semibold border border-dashed border-slate-800 rounded-xl">Nenhum registro de auditoria.</div>
                ) : (
                    logs.map((log) => renderAuditEntry(log))
                )}
            </div>
        </div>
    );
};
