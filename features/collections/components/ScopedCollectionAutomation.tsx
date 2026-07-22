import React, { useEffect, useState } from 'react';
import { MessageCircle, RotateCcw, Save, Settings2 } from 'lucide-react';
import {
  CollectionPolicy,
  DEFAULT_COLLECTION_POLICY,
  collectionAutomationService,
} from '../../../services/collectionAutomation.service';

interface Props {
  profileId: string;
  scope: 'CLIENT' | 'LOAN';
  scopeId: string;
  label: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

const toneOptions = [
  ['CORDIAL', 'Cordial'],
  ['OBJECTIVE', 'Objetivo'],
  ['MEDIATOR', 'Mediador'],
  ['FIRM_RESPECTFUL', 'Firme'],
] as const;

const cadenceOptions = [
  ['MANUAL', 'Somente manual'],
  ['DAILY', 'Todos os dias'],
  ['WEEKLY', 'Uma vez por semana'],
] as const;

export const ScopedCollectionAutomation: React.FC<Props> = ({
  profileId, scope, scopeId, label, showToast, compact = false,
}) => {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inherited, setInherited] = useState<CollectionPolicy | null>(null);
  const [policy, setPolicy] = useState<CollectionPolicy | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const configured = await collectionAutomationService.isWhatsAppConfigured(profileId);
      setAvailable(configured);
      if (!configured) return;
      const [globalPolicy, scopedPolicy] = await Promise.all([
        collectionAutomationService.getDefaultPolicy(profileId),
        scope === 'CLIENT'
          ? collectionAutomationService.getClientPolicy(profileId, scopeId)
          : collectionAutomationService.getLoanPolicy(profileId, scopeId),
      ]);
      setInherited(globalPolicy);
      setPolicy(scopedPolicy);
    } catch (error: any) {
      showToast(error.message || 'Falha ao carregar a recorrência.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [profileId, scope, scopeId]);

  if (loading || !available) return null;

  const effective = policy || inherited || ({ ...DEFAULT_COLLECTION_POLICY, profile_id: profileId } as CollectionPolicy);
  const patch = (next: Partial<CollectionPolicy>) => {
    setPolicy((current) => ({
      ...(current || effective),
      id: current?.id,
      profile_id: profileId,
      client_id: scope === 'CLIENT' ? scopeId : null,
      loan_id: scope === 'LOAN' ? scopeId : null,
      ...next,
    }));
  };

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      const saved = scope === 'CLIENT'
        ? await collectionAutomationService.saveClientPolicy(policy, scopeId)
        : await collectionAutomationService.saveLoanPolicy(policy, scopeId);
      setPolicy(saved);
      showToast(`Recorrência personalizada de ${label} salva.`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Falha ao salvar a recorrência.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!policy?.id) {
      setPolicy(null);
      return;
    }
    setSaving(true);
    try {
      await collectionAutomationService.deletePolicy(profileId, policy.id);
      setPolicy(null);
      showToast(`${label} voltou a usar a configuração global.`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Falha ao restaurar a configuração global.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${compact ? 'mt-2' : ''} rounded-lg border border-emerald-500/20 bg-emerald-500/5`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex items-center gap-2 text-[9px] font-black uppercase text-emerald-300">
          <MessageCircle size={13} /> Cobrança recorrente
        </span>
        <span className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-500">
          {policy ? 'Personalizada' : 'Usa regra global'} <Settings2 size={12} />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-emerald-500/10 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-[8px] font-black uppercase text-slate-500">Recorrência
              <select value={effective.overdue_cadence} onChange={(event) => patch({ overdue_cadence: event.target.value as CollectionPolicy['overdue_cadence'] })} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-[10px] text-white">
                {cadenceOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
            <label className="text-[8px] font-black uppercase text-slate-500">Tom
              <select value={effective.tone} onChange={(event) => patch({ tone: event.target.value as CollectionPolicy['tone'] })} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-[10px] text-white">
                {toneOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {[
              ['remind_two_days_before', '2 dias antes'],
              ['remind_due_today', 'No dia'],
              ['remind_first_overdue_day', '1º atraso'],
            ].map(([key, text]) => (
              <label key={key} className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 p-2 text-[8px] font-bold text-slate-400">
                <input type="checkbox" checked={Boolean(effective[key as keyof CollectionPolicy])} onChange={(event) => patch({ [key]: event.target.checked })} /> {text}
              </label>
            ))}
          </div>

          <button type="button" onClick={() => patch({ enabled: !effective.enabled })} className={`w-full rounded-lg border p-2 text-[9px] font-black uppercase ${effective.enabled ? 'border-emerald-500/30 text-emerald-300' : 'border-slate-800 text-slate-500'}`}>
            {effective.enabled ? 'Automação ativa' : 'Automação desligada'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} disabled={saving} className="flex items-center justify-center gap-1 rounded-lg border border-slate-800 p-2 text-[8px] font-black uppercase text-slate-400 disabled:opacity-50">
              <RotateCcw size={11} /> Usar global
            </button>
            <button type="button" onClick={save} disabled={saving || !policy} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 p-2 text-[8px] font-black uppercase text-white disabled:bg-slate-800 disabled:text-slate-500">
              <Save size={11} /> Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
