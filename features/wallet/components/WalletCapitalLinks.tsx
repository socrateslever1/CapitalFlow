import React, { useRef, useState } from 'react';
import { AlertCircle, Link2, Loader2 } from 'lucide-react';
import type { PersonalWalletAccount } from '../../../services/personalWallet.service';
import { personalWalletService } from '../../../services/personalWallet.service';
import type { CapitalSource } from '../../../types';
import { getCapitalLinkState } from '../domain/capitalLink';

type Props = {
  accounts: PersonalWalletAccount[];
  sources: CapitalSource[];
  canManage?: boolean;
  onSaved?: () => Promise<void>;
};

export const WalletCapitalLinks: React.FC<Props> = ({
  accounts, sources, canManage = false, onSaved,
}) => {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const lock = useRef(false);

  const link = async (account: PersonalWalletAccount, rawSourceId: string) => {
    if (!canManage || lock.current) return;
    const nextSourceId = rawSourceId || null;
    const currentSourceId = account.capital_source_id || null;
    if (currentSourceId === nextSourceId) return;
    const nextSource = sources.find(source => source.id === nextSourceId);
    if (nextSourceId && (!nextSource || Math.round(Number(nextSource.balance) * 100) !== Math.round(Number(account.balance) * 100))) {
      setNotice({ error: true, message: 'A fonte precisa estar disponível e possuir o mesmo saldo da conta.' });
      return;
    }
    if (!window.confirm(nextSourceId
      ? 'Vincular esta conta à fonte selecionada? As movimentações futuras seguirão a integração financeira existente. Os saldos atuais precisam ser iguais.'
      : 'Desvincular a fonte desta conta? As movimentações anteriores não serão modificadas.')) return;
    lock.current = true;
    setSavingId(account.id);
    setNotice(null);
    try {
      await personalWalletService.linkAccountCapitalSource(account.id, nextSourceId);
      setNotice({ error: false, message: 'Vínculo atualizado. Os registros anteriores foram preservados.' });
      try {
        await onSaved?.();
      } catch (error) {
        console.error('[WalletCapitalLinks] Vínculo confirmado; falha ao atualizar visão:', error);
        setNotice({ error: false, message: 'Vínculo salvo. Reabra a Carteira para atualizar os dados exibidos.' });
      }
    } catch (error) {
      setNotice({ error: true, message: error instanceof Error ? error.message : 'Falha na vinculação.' });
    } finally {
      lock.current = false;
      setSavingId(null);
    }
  };

  return (
    <section aria-label="Integração com Capital" className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-base font-bold text-white">
        <Link2 size={18} className="text-blue-400" />Integração com Capital
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">
        Fontes independentes permanecem separadas. Contas vinculadas utilizam a integração de saldos existente.
        O limite de um cartão não é saldo de conta.
      </p>
      {notice && <p role={notice.error ? 'alert' : 'status'} className={`mt-3 rounded-lg border p-3 text-xs ${notice.error ? 'border-rose-500/30 text-rose-200' : 'border-emerald-500/30 text-emerald-200'}`}>{notice.message}</p>}
      {!accounts.length ? (
        <p className="mt-4 text-sm text-slate-300">Cadastre uma conta para vincular uma fonte.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-800">
          {accounts.map(account => {
            const state = getCapitalLinkState(account, sources);
            const warning = state.status === 'divergent' || state.status === 'unavailable';
            const options = sources.filter(source => {
              if (source.id === account.capital_source_id) return true;
              if (['CARD', 'MISTO'].includes(source.type)) return false;
              if (accounts.some(other => other.id !== account.id && other.capital_source_id === source.id)) return false;
              return Number.isFinite(Number(source.balance)) &&
                Math.round(Number(source.balance) * 100) === Math.round(Number(account.balance) * 100);
            });
            return (
              <li key={account.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="break-words text-sm font-semibold text-white">{account.nickname}</p>
                <p className={`flex items-start gap-1.5 text-xs leading-relaxed ${warning ? 'text-rose-300' : state.status === 'linked' ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {warning && <AlertCircle size={15} className="mt-0.5 shrink-0" />}
                  <span>{state.status === 'unlinked' ? 'Sem vínculo' : state.status === 'unavailable' ? 'Fonte indisponível' : state.status === 'divergent' ? 'Saldos divergentes: não movimentar sem reconciliação' : `${state.source?.name} · saldos conferem`}</span>
                </p>
                {canManage && (
                  <div className="relative">
                    <label htmlFor={`capital-link-${account.id}`} className="sr-only">Fonte vinculada à conta {account.nickname}</label>
                    <select
                      id={`capital-link-${account.id}`}
                      value={account.capital_source_id || ''}
                      disabled={savingId !== null}
                      onChange={event => { void link(account, event.target.value); }}
                      className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-400 disabled:opacity-60"
                    >
                      <option value="">Manter independente (sem vínculo)</option>
                      {options.map(source => (
                        <option key={source.id} value={source.id}>
                          {source.name}{Math.round(Number(source.balance) * 100) !== Math.round(Number(account.balance) * 100) ? ' · saldos divergentes' : ''}
                        </option>
                      ))}
                    </select>
                    {savingId === account.id && <Loader2 size={15} className="absolute right-9 top-3 animate-spin text-blue-300" />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-400">
        Gastos financiados por cartão devem constar uma única vez na fatura. Informar o custo de captação em um contrato não cria nova compra ou despesa na Carteira.
      </p>
    </section>
  );
};
