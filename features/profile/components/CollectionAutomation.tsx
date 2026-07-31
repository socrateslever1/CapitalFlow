import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, History, MessageCircle, PauseCircle, Plus, Save, ShieldCheck, X } from 'lucide-react';
import {
  CollectionCadence,
  CollectionPolicy,
  CollectionTone,
  collectionAutomationService,
} from '../../../services/collectionAutomation.service';

interface Props {
  profileId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const toneLabels: Record<CollectionTone, string> = {
  CORDIAL: 'Cordial', OBJECTIVE: 'Objetivo', MEDIATOR: 'Mediador', FIRM_RESPECTFUL: 'Firme e respeitoso',
};
const cadenceLabels: Record<CollectionCadence, string> = {
  MANUAL: 'Manual após o primeiro atraso', DAILY: 'Todos os dias', WEEKLY: 'Uma vez por semana',
};

export const CollectionAutomation: React.FC<Props> = ({ profileId, showToast }) => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [policy, setPolicy] = useState<CollectionPolicy | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    collectionAutomationService.isWhatsAppConfigured(profileId).then(async (configured) => {
      setAvailable(configured);
      if (!configured) return;
      const [loadedPolicy, loadedHistory] = await Promise.all([
        collectionAutomationService.getDefaultPolicy(profileId),
        collectionAutomationService.listRecentDispatches(profileId),
      ]);
      setPolicy(loadedPolicy);
      setHistory(loadedHistory);
    }).catch((error) => showToast(error.message || 'Falha ao carregar a régua.', 'error'));
  }, [profileId, showToast]);

  const preview = useMemo(() => {
    if (!policy) return '';
    if (policy.tone === 'MEDIATOR') return 'Olá, Ana. A parcela está em atraso, com valor atualizado de R$ 1.287,50. Se houve algum imprevisto, podemos conversar para encontrar o melhor encaminhamento.';
    if (policy.tone === 'FIRM_RESPECTFUL') return 'Olá, Ana. A parcela permanece em aberto. O valor atualizado é R$ 1.287,50. Por favor, responda para regularizar ou conversar com o operador.';
    if (policy.tone === 'OBJECTIVE') return 'Olá, Ana. Consta uma parcela vencida no valor atualizado de R$ 1.287,50. Deseja receber ajuda para pagar ou falar com o operador?';
    return 'Olá, Ana. Identificamos que a parcela continua em aberto. O valor atualizado hoje é R$ 1.287,50. Quer conversar sobre isso ou receber ajuda para pagar?';
  }, [policy]);

  if (available === false) return null;
  if (available === null || !policy) return <div className="h-40 rounded-lg bg-slate-900 animate-pulse" />;
  const patch = (next: Partial<CollectionPolicy>) => setPolicy((current) => current ? { ...current, ...next } : current);
  const sendHours = policy.send_hours?.length ? policy.send_hours : [policy.send_hour || 9];
  const updateHour = (index: number, hour: number) => {
    const nextHours = sendHours.map((value, currentIndex) => currentIndex === index ? hour : value);
    patch({ send_hours: [...new Set(nextHours)].sort((a, b) => a - b) });
  };
  const addHour = () => {
    if (sendHours.length >= 3) return;
    const nextAvailable = Array.from({ length: 11 }, (_, index) => index + 8)
      .find((hour) => !sendHours.includes(hour));
    if (nextAvailable !== undefined) patch({ send_hours: [...sendHours, nextAvailable].sort((a, b) => a - b) });
  };
  const removeHour = (index: number) => {
    if (sendHours.length === 1) return;
    patch({ send_hours: sendHours.filter((_, currentIndex) => currentIndex !== index) });
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await collectionAutomationService.saveDefaultPolicy(policy);
      setPolicy(saved);
      showToast(saved.enabled ? 'Régua de cobrança ativada.' : 'Configuração salva; envios automáticos permanecem desligados.', 'success');
    } catch (error: any) {
      showToast(error.message || 'Falha ao salvar a régua.', 'error');
    } finally { setSaving(false); }
  };

  return <div className="space-y-5 rounded-lg border border-slate-800 bg-slate-950 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="flex items-center gap-2 text-sm font-black uppercase text-white"><MessageCircle size={17} className="text-emerald-400" /> Régua híbrida de cobrança</h4><p className="mt-1 text-[10px] text-slate-500">Lembretes automáticos com controle humano para negociação e exceções.</p></div>
      <button type="button" onClick={() => patch({ enabled: !policy.enabled })} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase ${policy.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{policy.enabled ? 'Automação ativa' : 'Automação desligada'}</button>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="text-[10px] font-black uppercase text-slate-500">Recorrência após atraso<select value={policy.overdue_cadence} onChange={(e) => patch({ overdue_cadence: e.target.value as CollectionCadence })} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-white">{Object.entries(cadenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-[10px] font-black uppercase text-slate-500">Tom da mensagem<select value={policy.tone} onChange={(e) => patch({ tone: e.target.value as CollectionTone })} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-white">{Object.entries(toneLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    {policy.overdue_cadence !== 'MANUAL' && (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400"><Clock3 size={14} /> Horários de envio</p>
            <p className="mt-1 text-[9px] text-slate-600">Defina até três cobranças por dia.</p>
          </div>
          <button type="button" onClick={addHour} disabled={sendHours.length >= 3} className="flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1.5 text-[9px] font-black uppercase text-emerald-400 disabled:border-slate-800 disabled:text-slate-700">
            <Plus size={12} /> Adicionar
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {sendHours.map((hour, index) => (
            <label key={`${hour}-${index}`} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3">
              <select value={hour} onChange={(event) => updateHour(index, Number(event.target.value))} className="h-11 min-w-0 flex-1 bg-transparent text-xs font-bold text-white outline-none">
                {Array.from({ length: 11 }, (_, hourIndex) => hourIndex + 8).map((optionHour) => (
                  <option key={optionHour} value={optionHour}>{String(optionHour).padStart(2, '0')}:00</option>
                ))}
              </select>
              {sendHours.length > 1 && (
                <button type="button" onClick={() => removeHour(index)} className="text-slate-600 hover:text-rose-400" aria-label={`Remover horário ${String(hour).padStart(2, '0')}:00`}>
                  <X size={14} />
                </button>
              )}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[9px] font-bold text-emerald-400">
          {sendHours.length === 1 ? 'Uma cobrança por dia' : `${sendHours.length} cobranças por dia`} até o pagamento.
        </p>
      </div>
    )}

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[
      ['remind_two_days_before', 'Dois dias antes'], ['remind_due_today', 'No vencimento'], ['remind_first_overdue_day', 'Primeiro dia em atraso'],
    ].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-[10px] font-bold text-slate-300"><input type="checkbox" checked={Boolean(policy[key as keyof CollectionPolicy])} onChange={(e) => patch({ [key]: e.target.checked })} />{label}</label>)}</div>

    <button type="button" onClick={() => patch({ paused: !policy.paused, pause_reason: !policy.paused ? 'Pausa manual pelo operador' : null })} className={`flex w-full items-center justify-center gap-2 rounded-lg border p-3 text-[10px] font-black uppercase ${policy.paused ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-800 text-slate-400'}`}><PauseCircle size={15} />{policy.paused ? 'Pausada — clique para retomar' : 'Pausar todas as cobranças'}</button>

    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4"><p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase text-indigo-300"><ShieldCheck size={14} /> Prévia do tom</p><p className="text-xs leading-relaxed text-slate-300">{preview}</p></div>
    <div className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500"><Clock3 size={14} className="mt-0.5 shrink-0" />O envio para após pagamento e fica suspenso por sete dias quando o cliente responde. Contestação, promessa ou negociação aberta também suspendem a régua; não use o tom firme para ameaçar ou constranger.</div>
    <button type="button" onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-xs font-black uppercase text-white disabled:bg-slate-800"><Save size={15} />{saving ? 'Salvando...' : 'Salvar régua de cobrança'}</button>

    <div className="border-t border-slate-900 pt-4"><h5 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase text-slate-400"><History size={14} /> Histórico recente</h5>{history.length === 0 ? <p className="text-[10px] text-slate-600">Nenhum envio automático registrado.</p> : <div className="max-h-56 space-y-2 overflow-auto">{history.map((item) => <div key={item.id} className="rounded border border-slate-800 bg-slate-900 p-3"><div className="flex justify-between text-[9px] font-black uppercase"><span className="text-slate-400">{item.stage}</span><span className={item.status === 'SENT' ? 'text-emerald-400' : item.status === 'ERROR' ? 'text-rose-400' : 'text-amber-400'}>{item.status}</span></div><p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{item.message}</p></div>)}</div>}</div>
  </div>;
};
