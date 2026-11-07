import React from 'react';
import { ARCHIVE_REASONS, creditImpactFromArchive, type ArchiveReason } from '../../domain/credit/archivePolicy';

interface Props {
  reason: ArchiveReason | '';
  note: string;
  onReasonChange: (reason: ArchiveReason | '') => void;
  onNoteChange: (note: string) => void;
}
export const ArchiveReasonFields: React.FC<Props> = ({ reason, note, onReasonChange, onNoteChange }) => {
  const selected = ARCHIVE_REASONS.find(item => item.code === reason);
  const impact = creditImpactFromArchive(reason || null);
  return (
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-left">
      <div>
        <label htmlFor="archive-reason" className="text-sm font-semibold text-slate-100">Motivo do arquivamento</label>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">A classificação orienta a concessão de novos créditos. Não altera saldos, pagamentos ou parcelas.</p>
      </div>
      <select id="archive-reason" required value={reason} onChange={e => onReasonChange(e.target.value as ArchiveReason | '')}
        className="block min-h-12 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white focus:border-blue-400 focus:outline-none">
        <option value="">Selecione um motivo</option>
        {ARCHIVE_REASONS.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      {selected && <p className={`text-xs leading-relaxed ${impact === 'BLOCK' ? 'text-rose-300' : impact === 'REVIEW' ? 'text-amber-300' : 'text-emerald-300'}`}>{selected.description}</p>}
      <label htmlFor="archive-note" className="block text-xs font-semibold text-slate-200">
        Justificativa {reason === 'ADMINISTRATIVE' ? '(opcional)' : '(obrigatória)'}
      </label>
      <textarea id="archive-note" rows={3} maxLength={500} value={note}
        onChange={e => onNoteChange(e.target.value)}
        placeholder="Descreva objetivamente os fatos que justificam o encerramento."
        className="block min-h-24 w-full resize-y rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-white focus:border-blue-400 focus:outline-none" />
    </section>
  );
};
