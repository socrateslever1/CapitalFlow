import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import type { CapitalSource } from '../../types';
import { supabase } from '../../lib/supabase';
import { personalWalletService } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import {
  decodeWalletReference,
  encodeWalletReference,
  getSourceWalletAvailability,
  type WalletReference,
  type WalletResource,
} from '../../domain/sources/sourceWalletReference';

type Props = {
  sources: CapitalSource[];
  activeUser?: { id: string; supervisor_id?: string | null } | null;
  onEditManual: (source: CapitalSource) => void;
};

type Snapshot = { accounts: WalletResource[]; cards: WalletResource[] };

export const SourceWalletReferencePanel: React.FC<Props> = ({
  sources, activeUser, onEditManual,
}) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [references, setReferences] = useState<WalletReference[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const allowed = !!activeUser && activeUser.id !== 'DEMO' && !activeUser.supervisor_id;
  const userId = activeUser?.id || '';
  const sourceIds = useMemo(() => sources.map(s => s.id).sort().join('|'), [sources]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const [wallet, response] = await Promise.all([
        personalWalletService.loadOverview(),
        supabase.from('capital_source_wallet_references')
          .select('source_id,target_kind,target_id')
          .order('source_id'),
      ]);
      if (response.error) throw response.error;
      const rows = (response.data || []) as WalletReference[];
      if (!mounted.current) return;
      setSnapshot({ accounts: wallet.accounts, cards: wallet.cards });
      setReferences(rows);
      setDrafts(Object.fromEntries(rows.map(r => [
        r.source_id, encodeWalletReference(r.target_kind, r.target_id),
      ])));
    } catch {
      if (mounted.current) {
        setError('Não foi possível consultar as origens disponíveis. Atualize a página e tente novamente.');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [allowed, userId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load, sourceIds]);

  const save = async (source: CapitalSource) => {
    if (!allowed || loading || savingId) return;
    const previous = references.find(ref => ref.source_id === source.id) || null;
    const nextRaw = drafts[source.id] || '';
    const previousRaw = previous ? encodeWalletReference(previous.target_kind, previous.target_id) : '';
    if (nextRaw === previousRaw) return;
    const next = nextRaw ? decodeWalletReference(nextRaw) : null;
    if (nextRaw && !next) {
      setError('Selecione uma origem válida.');
      return;
    }
    if (next && !snapshot) {
      setError('Os dados da Carteira não estão disponíveis.');
      return;
    }
    if (next?.kind === 'ACCOUNT' &&
        !snapshot?.accounts.some(account => account.id === next.id && !account.capital_source_id)) {
      setError('Esta conta já está vinculada à sincronização financeira ou não está disponível.');
      return;
    }
    if (next?.kind === 'CARD' &&
        !snapshot?.cards.some(card => card.id === next.id && card.status === 'ACTIVE')) {
      setError('Este cartão não está disponível.');
      return;
    }
    if (!window.confirm(next
      ? 'Associar esta fonte ao recurso selecionado? A associação apenas consulta disponibilidade; não cria movimentações nem substitui o saldo operacional.'
      : 'Remover a referência e manter esta fonte independente?')) return;

    setSavingId(source.id);
    setError('');
    setMessage('');
    try {
      const { data, error: rpcError } = await supabase.rpc('capital_source_set_wallet_reference', {
        p_source_id: source.id,
        p_target_kind: next?.kind || null,
        p_target_id: next?.id || null,
      });
      if (rpcError || data !== true) throw rpcError || new Error('Operação não confirmada.');
      setMessage('Origem do recurso atualizada.');
      await load();
    } catch {
      setError('Não foi possível salvar a origem. Confira a propriedade do recurso e tente novamente.');
    } finally {
      if (mounted.current) setSavingId(null);
    }
  };

  if (!allowed) return null;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5" aria-label="Origem dos recursos das fontes">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Link2 size={18} className="text-blue-400" /> Origem dos recursos
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            Escolha uma conta ou cartão da Minha Carteira para consultar sua disponibilidade,
            ou mantenha o saldo informado manualmente. Nenhuma associação é automática.
          </p>
        </div>
        <button type="button" onClick={() => { void load(); }} disabled={loading || !!savingId}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs text-slate-200 disabled:opacity-40">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-700/40 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
      {message && <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p>}
      {loading && <p className="mt-4 flex items-center gap-2 text-xs text-slate-300"><Loader2 size={15} className="animate-spin"/> Consultando recursos...</p>}

      {!loading && snapshot && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {sources.map(source => {
            const current = references.find(ref => ref.source_id === source.id) || null;
            const selection = drafts[source.id] ?? (current ? encodeWalletReference(current.target_kind, current.target_id) : '');
            const chosen = selection ? decodeWalletReference(selection) : null;
            const effective = chosen
              ? { source_id: source.id, target_kind: chosen.kind, target_id: chosen.id }
              : null;
            const availability = getSourceWalletAvailability(source, effective, snapshot.accounts, snapshot.cards);
            const saved = current ? encodeWalletReference(current.target_kind, current.target_id) : '';
            return (
              <div key={source.id} className="min-w-0 space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="break-words text-sm font-semibold text-white">{source.name}</h3>
                <p className="text-xs text-slate-400">Saldo operacional: <strong className="text-white">{formatMoney(Number(source.balance))}</strong></p>
                <label htmlFor={'wallet-origin-' + source.id} className="block text-xs font-medium text-slate-300">
                  Recurso de referência
                </label>
                <select id={'wallet-origin-' + source.id}
                  value={selection}
                  onChange={e => setDrafts(old => ({ ...old, [source.id]: e.target.value }))}
                  disabled={!!savingId}
                  className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white disabled:opacity-50">
                  <option value="">Independente — valor informado pelo usuário</option>
                  {snapshot.accounts.filter(a => !a.capital_source_id).map(a => {
                    const value = encodeWalletReference('ACCOUNT', a.id);
                    const used = references.some(r => r.source_id !== source.id && r.target_kind === 'ACCOUNT' && r.target_id === a.id);
                    return <option key={value} value={value} disabled={used}>Conta · {a.nickname}{used ? ' (já selecionada)' : ''}</option>;
                  })}
                  {snapshot.cards.filter(c => c.status === 'ACTIVE').map(c => {
                    const value = encodeWalletReference('CARD', c.id);
                    const used = references.some(r => r.source_id !== source.id && r.target_kind === 'CARD' && r.target_id === c.id);
                    return <option key={value} value={value} disabled={used}>Cartão · {c.nickname}{used ? ' (já selecionado)' : ''}</option>;
                  })}
                  {saved && !(
                    snapshot.accounts.some(a => encodeWalletReference('ACCOUNT', a.id) === saved && !a.capital_source_id) ||
                    snapshot.cards.some(c => encodeWalletReference('CARD', c.id) === saved && c.status === 'ACTIVE')
                  ) && <option value={saved}>Recurso anterior indisponível — altere a seleção</option>}
                </select>
                <p className="text-xs text-slate-300">
                  {availability.label}: <strong className="text-white">{availability.amount === null ? 'Não disponível' : formatMoney(availability.amount)}</strong>
                </p>
                {availability.differs && (
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0"/>
                    O valor de referência difere do saldo operacional. Nenhuma conciliação é automática.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={() => { void save(source); }}
                    disabled={!!savingId || selection === saved}
                    className="min-h-10 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-40">
                    {savingId === source.id ? 'Salvando...' : 'Salvar origem'}
                  </button>
                  {!selection && (
                    <button type="button" onClick={() => onEditManual(source)}
                      className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs text-slate-200">
                      Alterar valor manual
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Limite de cartão não é dinheiro em conta. A associação é apenas informativa: não lança compras,
        não movimenta recursos e não altera automaticamente os contratos.
      </p>
    </section>
  );
};
