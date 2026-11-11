import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import type { CapitalSource } from '../../types';
import { supabase } from '../../lib/supabase';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import {
  encodeWalletReference,
  getSourceWalletAvailability,
  type WalletReference,
  type WalletReferenceKind,
  type WalletResource,
} from '../../domain/sources/sourceWalletReference';

type Props = {
  saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  sources: CapitalSource[];
  activeUser?: { id: string; supervisor_id?: string | null } | null;
  onEditManual: (source: CapitalSource) => void;
};
type DraftOrigin = { selected: boolean };
type Snapshot = { accounts: WalletResource[]; cards: WalletResource[] };
type OriginRow = WalletReference & { allocated_amount?: number | null };

export const SourceWalletReferencePanel: React.FC<Props> = ({ sources, activeUser, onEditManual, saveRef }) => {
  const navigate = useNavigate();
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
        next[encodeWalletReference(row.target_kind, row.target_id)] = { selected: true };
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
  const hasChanges = saved.length !== selectedKeys.length ||
    selectedKeys.some(key => !saved.some(row => encodeWalletReference(row.target_kind, row.target_id) === key));

  const updateDraft = (key: string, patch: Partial<DraftOrigin>) => {
    setMessage('');
    setError('');
    setDraft(previous => ({
      ...previous,
      [key]: { selected: previous[key]?.selected ?? false, ...patch },
    }));
  };

  const save = async (): Promise<boolean> => {
    if (!source || !allowed || loading || saving || !snapshot) {
      setError('Aguarde o carregamento das origens antes de salvar.');
      return false;
    }
    if (!hasChanges) return true;
    setError('');
    setMessage('');
    const origins: Array<{ target_kind: WalletReferenceKind; target_id: string; allocated_amount: number | null }> = [];
    try {
      if (selectedKeys.length > 32) throw new Error('Selecione no máximo 32 origens.');
      for (const key of selectedKeys) {
        const previous = saved.find(row => encodeWalletReference(row.target_kind, row.target_id) === key);
        const resource = resources.find(item => encodeWalletReference(item.kind, item.id) === key);
        if (!resource && !previous) throw new Error('Origem não autorizada ou indisponível.');
        // A origem antiga só pode ser preservada quando já pertencia a esta fonte.
        // Sua validade será novamente verificada pela RPC transacional.
        origins.push({
          target_kind: resource?.kind ?? previous!.target_kind,
          target_id: resource?.id ?? previous!.target_id,
          allocated_amount: previous?.allocated_amount ?? null,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confira os valores informados.');
      return false;
    }

    setSaving(true);
    try {
      const result = await supabase.rpc('capital_source_replace_wallet_origins', {
        p_source_id: source.id,
        p_origins: origins,
      });
      if (result.error || result.data !== true) throw result.error || new Error('Confirmação não recebida.');
      // Uma RPC sem erro não é prova de persistência: releia exatamente a fonte.
      const persisted = await supabase.from('capital_source_wallet_references')
        .select('source_id,target_kind,target_id,allocated_amount')
        .eq('source_id', source.id);
      if (persisted.error) throw persisted.error;
      const persistedRows = (persisted.data || []) as OriginRow[];
      const persistedKeys = persistedRows.map(row => encodeWalletReference(row.target_kind, row.target_id)).sort();
      const requestedKeys = origins.map(row => encodeWalletReference(row.target_kind, row.target_id)).sort();
      if (persistedKeys.length !== requestedKeys.length ||
          persistedKeys.some((key, index) => key !== requestedKeys[index])) {
        throw new Error('O banco não confirmou as origens selecionadas.');
      }
      const nextDraft: Record<string, DraftOrigin> = {};
      for (const row of persistedRows) {
        nextDraft[encodeWalletReference(row.target_kind, row.target_id)] = { selected: true };
      }
      setSaved(persistedRows);
      setDraft(nextDraft);
      window.dispatchEvent(new CustomEvent('capitalflow:source-origins-updated', {
        detail: { sourceId: source.id },
      }));
      setMessage('Origens confirmadas e salvas.');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as origens.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (saveRef) saveRef.current = save;
    return () => { if (saveRef) saveRef.current = null; };
  }, [saveRef, save]);

  if (!source || (!allowed && !loading && !error)) return null;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3" aria-label="Origens dos recursos">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Link2 size={16} className="text-blue-400" /> Origem dos recursos
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Selecione contas e cartões. O sistema utiliza o saldo total ou crédito disponível
            de cada recurso, sem alterar o saldo operacional da fonte.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Fontes de capital do tipo cartão não criam cartões automaticamente. As origens disponíveis pertencem à Minha Carteira.</p>
          {allowed && <button type="button" onClick={() => {
            if (hasChanges) { setError('Salve as alterações nas origens antes de cadastrar outro cartão.'); return; }
            navigate('/carteira/cartoes?acao=novo-cartao');
          }} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-blue-500/40 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/10">
            Cadastrar cartão ausente
          </button>}
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

                </div>
              );
            })}
            {saved.filter(row => !availableKeys.has(encodeWalletReference(row.target_kind,row.target_id))).map(row => {
              const key = encodeWalletReference(row.target_kind,row.target_id);
              const original = row.target_kind === 'CARD'
                ? snapshot.cards.find(card => card.id === row.target_id)
                : snapshot.accounts.find(account => account.id === row.target_id);
              const description = row.target_kind === 'CARD'
                ? original ? `Cartão ${original.nickname} inativo` : 'Cartão antigo não localizado na Minha Carteira'
                : original ? `Conta ${original.nickname} já vinculada a outra fonte` : 'Conta antiga não localizada na Minha Carteira';
              return <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-amber-700/40 p-3 text-xs text-amber-300">
                <input type="checkbox" checked={draft[key]?.selected ?? false}
                  onChange={event => updateDraft(key, { selected: event.target.checked })}
                  disabled={saving} className="h-5 w-5 shrink-0" />
                <span className="min-w-0"><strong className="block font-semibold">{description}</strong>
                  <span className="mt-1 block text-amber-200/80">Vínculo antigo mantido. Desmarque apenas se desejar removê-lo.</span>
                </span>
              </label>;
            })}
            {resources.length === 0 && saved.length === 0 &&
              <p className="text-xs text-slate-400">Nenhuma conta ou cartão elegível cadastrado na Minha Carteira.</p>}
          </div>
          <p className="mt-3 text-xs text-slate-300">
            {selectedKeys.length} origem(ns) selecionada(s). Confirme em <strong>Salvar alterações</strong>.
          </p>
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
