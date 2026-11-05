import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import type { CapitalSource } from '../../types';
import { supabase } from '../../lib/supabase';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { parseWalletMoney } from '../../features/wallet/utils/parseWalletMoney';
import {
  encodeWalletReference,
  getSourceWalletAvailability,
  type WalletReference,
  type WalletReferenceKind,
  type WalletResource,
} from '../../domain/sources/sourceWalletReference';

type Props = {
  sources: CapitalSource[];
  activeUser?: { id: string; supervisor_id?: string | null } | null;
  onEditManual: (source: CapitalSource) => void;
};
type DraftOrigin = { selected: boolean; amount: string };
type Snapshot = { accounts: WalletResource[]; cards: WalletResource[] };
type OriginRow = WalletReference & { allocated_amount?: number | null };

export const SourceWalletReferencePanel: React.FC<Props> = ({ sources, activeUser, onEditManual }) => {
  const source = sources[0] ?? null;
  const sourceId = source?.id ?? '';
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [saved, setSaved] = useState<OriginRow[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftOrigin>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (alive: () => boolean) => {
    if (!activeUser || activeUser.id === 'DEMO' || !!activeUser.supervisor_id || !sourceId) {
      if (alive()) { setAllowed(false); setLoading(false); }
      return;
    }
    if (alive()) { setLoading(true); setError(''); }
    try {
      const permission = await supabase.rpc('can_manage_capital_source_wallet_origins');
      if (permission.error) throw permission.error;
      if (!permission.data) {
        if (alive()) { setAllowed(false); setLoading(false); }
        return;
      }
      const [wallet, result] = await Promise.all([
        personalWalletService.loadOverview(),
        supabase.from('capital_source_wallet_references')
          .select('source_id,target_kind,target_id,allocated_amount')
          .eq('source_id', sourceId),
      ]);
      if (result.error) throw result.error;
      if (!alive()) return;
      const rows = (result.data || []) as OriginRow[];
      const next: Record<string, DraftOrigin> = {};
      for (const row of rows) {
        next[encodeWalletReference(row.target_kind, row.target_id)] = {
          selected: true,
          amount: row.allocated_amount == null
            ? ''
            : Number(row.allocated_amount).toFixed(2).replace('.', ','),
        };
      }
      setAllowed(true);
      setSnapshot({ accounts: wallet.accounts, cards: wallet.cards });
      setSaved(rows);
      setDraft(next);
    } catch {
      if (alive()) {
        setError('Não foi possível carregar as origens. Verifique a conexão e tente novamente.');
      }
    } finally {
      if (alive()) setLoading(false);
    }
  }, [activeUser?.id, activeUser?.supervisor_id, sourceId]);

  useEffect(() => {
    let mounted = true;
    void load(() => mounted);
    return () => { mounted = false; };
  }, [load]);

  const resources = useMemo(() => {
    if (!snapshot) return [];
    return [
      ...snapshot.accounts
        .filter(a => !a.capital_source_id)
        .map(a => ({ ...a, kind: 'ACCOUNT' as const })),
      ...snapshot.cards
        .filter(c => c.status === 'ACTIVE')
        .map(c => ({ ...c, kind: 'CARD' as const })),
    ];
  }, [snapshot]);

  const availableKeys = new Set(resources.map(r => encodeWalletReference(r.kind, r.id)));
  const selectedKeys = Object.keys(draft).filter(key => draft[key].selected);
  const hasChanges = (() => {
    if (saved.length !== selectedKeys.length) return true;
    return selectedKeys.some(key => {
      const existing = saved.find(item => encodeWalletReference(item.target_kind, item.target_id) === key);
      if (!existing) return true;
      const raw = draft[key]?.amount.trim() ?? '';
      if (!raw) return existing.allocated_amount != null;
      try {
        return parseWalletMoney(raw, 'o valor de referência') !== Number(existing.allocated_amount);
      } catch { return true; }
    });
  })();

  const updateDraft = (key: string, patch: Partial<DraftOrigin>) => {
    setMessage('');
    setError('');
    setDraft(previous => ({
      ...previous,
      [key]: { selected: previous[key]?.selected ?? false, amount: previous[key]?.amount ?? '', ...patch },
    }));
  };

  const save = async () => {
    if (!source || !allowed || loading || saving || !snapshot) return;
    setError('');
    setMessage('');
    const origins: Array<{ target_kind: WalletReferenceKind; target_id: string; allocated_amount: number | null }> = [];
    try {
      if (selectedKeys.length > 32) throw new Error('Selecione no máximo 32 origens.');
      for (const key of selectedKeys) {
        if (!availableKeys.has(key)) throw new Error('Remova o recurso indisponível antes de salvar.');
        const resource = resources.find(item => encodeWalletReference(item.kind, item.id) === key);
        if (!resource) throw new Error('Recurso indisponível.');
        const raw = draft[key]?.amount.trim() ?? '';
        const amount = raw === '' ? null : parseWalletMoney(raw, 'o valor de referência');
        origins.push({
          target_kind: resource.kind,
          target_id: resource.id,
          allocated_amount: amount,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confira os valores informados.');
      return;
    }

    if (!window.confirm(
      'Salvar ' + origins.length + ' origem(ns) para esta fonte? Os valores informados são referências, sem alterar saldos, limites ou contratos.',
    )) return;

    setSaving(true);
    try {
      const result = await supabase.rpc('capital_source_replace_wallet_origins', {
        p_source_id: source.id,
        p_origins: origins,
      });
      if (result.error || result.data !== true) throw result.error || new Error('Confirmação não recebida.');
      setMessage('Origens salvas com sucesso.');
      await load(() => true);
    } catch {
      setError('Não foi possível salvar as origens. Confirme as permissões e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (!source || (!allowed && !loading && !error)) return null;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3" aria-label="Origens dos recursos">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Link2 size={16} className="text-blue-400" /> Origem dos recursos
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Selecione uma ou mais contas e cartões. Defina um valor para cada origem,
            se desejar. O saldo desta fonte continua independente.
          </p>
        </div>
        <button type="button" aria-label="Atualizar recursos"
          disabled={loading || saving}
          onClick={() => { void load(() => true); }}
          className="min-h-9 min-w-9 rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-40">
          <RefreshCw size={15}/>
        </button>
      </div>
      {error && <p role="alert" className="mt-2 rounded-lg bg-rose-950/50 p-2 text-xs text-rose-200">{error}</p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-300">{message}</p>}
      {loading ? <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 size={14} className="animate-spin"/> Consultando recursos…
      </p> : allowed && snapshot && (
        <>
          <div className="mt-3 space-y-2">
            {resources.map(resource => {
              const key = encodeWalletReference(resource.kind, resource.id);
              const selected = draft[key]?.selected ?? false;
              const availability = getSourceWalletAvailability(
                source,
                { source_id: source.id, target_kind: resource.kind, target_id: resource.id },
                snapshot.accounts,
                snapshot.cards,
              );
              return (
                <div key={key} className="rounded-lg border border-slate-700/70 bg-slate-950/60 p-3">
                  <label className="flex min-h-10 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={selected} disabled={saving}
                      onChange={event => updateDraft(key, { selected: event.target.checked })}
                      className="h-5 w-5 accent-blue-500" />
                    <span className="min-w-0 flex-1 break-words text-sm text-slate-100">
                      {resource.kind === 'CARD' ? 'Cartão' : 'Conta'} · {resource.nickname}
                    </span>
                  </label>
                  <p className="ml-8 text-xs text-slate-400">
                    {availability.label}: {availability.amount == null ? 'Não disponível' : formatMoney(availability.amount)}
                  </p>
                  {selected && (
                    <label className="ml-8 mt-2 block text-xs text-slate-300">
                      Valor associado (R$) · opcional
                      <input type="text" inputMode="decimal"
                        value={draft[key]?.amount ?? ''}
                        disabled={saving}
                        placeholder="Informar valor"
                        aria-label={'Valor associado a ' + resource.nickname}
                        onChange={event => updateDraft(key, { amount: event.target.value })}
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-blue-500" />
                    </label>
                  )}
                </div>
              );
            })}
            {saved.filter(row => !availableKeys.has(encodeWalletReference(row.target_kind,row.target_id))).map(row => {
              const key = encodeWalletReference(row.target_kind,row.target_id);
              return <label key={key} className="flex items-center gap-3 rounded-lg border border-amber-700/40 p-3 text-xs text-amber-300">
                <input type="checkbox" checked={draft[key]?.selected ?? false}
                  onChange={event => updateDraft(key, { selected: event.target.checked })}
                  disabled={saving} className="h-5 w-5" />
                Origem anterior indisponível — desmarque para remover
              </label>;
            })}
            {resources.length === 0 && saved.length === 0 &&
              <p className="text-xs text-slate-400">Nenhuma conta ou cartão elegível cadastrado na Minha Carteira.</p>}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">{selectedKeys.length} origem(ns) selecionada(s)</p>
            <button type="button" onClick={() => { void save(); }}
              disabled={saving || !hasChanges}
              className="min-h-11 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? 'Salvando…' : 'Salvar origens'}
            </button>
          </div>
          <div className="mt-2 flex items-start gap-2 text-xs text-slate-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>Associação informativa. Não transfere dinheiro, não debita cartões e não altera contratos.</p>
          </div>
          {selectedKeys.length === 0 && <button type="button" onClick={() => onEditManual(source)}
            className="mt-2 text-xs text-blue-400 underline">Editar valor independente da fonte</button>}
        </>
      )}
    </section>
  );
};
