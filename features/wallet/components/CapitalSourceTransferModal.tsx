import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import type { CapitalSource } from '../../../types';
import { personalWalletService, type PersonalWalletAccount } from '../../../services/personalWallet.service';
import { platformAdminService } from '../../../services/platformAdmin.service';
import { formatMoney } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { parseWalletMoney } from '../utils/parseWalletMoney';
import { FinancialCalculatorInput } from '../../../components/forms/FinancialCalculatorInput';
import { Modal } from '../../../components/ui/Modal';
import { canMoveCapitalSource, getMovableCapitalTotal, validateCapitalMovement } from '../domain/capitalSourceTransfer';

type Props = {
  profileId: string;
  sources: CapitalSource[];
  accounts?: PersonalWalletAccount[];
  initialSourceId?: string;
  initialAccountId?: string;
  onClose: () => void;
  onSaved: () => Promise<unknown> | unknown;
};

/** Movimentação contábil. Nunca inicia Pix, TED ou novo recebimento de contrato. */
export const CapitalSourceTransferModal: React.FC<Props> = ({
  profileId, sources, accounts, initialSourceId, initialAccountId, onClose, onSaved,
}) => {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [destinationAccounts, setDestinationAccounts] = useState<PersonalWalletAccount[]>(accounts || []);
  const [sourceId, setSourceId] = useState(initialSourceId || '');
  const [accountId, setAccountId] = useState(initialAccountId || '');
  const [amountText, setAmountText] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(generateUUID());
  const busyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        const permitted = await platformAdminService.isSuperAdmin();
        if (!permitted) throw new Error('A movimentação de capital exige autorização Master.');
        const snapshot = await personalWalletService.loadOverview();
        if (!mounted) return;
        // Sempre utilizar contas efetivamente visíveis após reinício lógico.
        setDestinationAccounts(snapshot.accounts.filter(account => !account.archived_at));
        setReady(true);
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Não foi possível conferir suas contas.');
      } finally { if (mounted) setLoading(false); }
    };
    void initialize();
    return () => { mounted = false; };
  }, []);

  const eligible = useMemo(() => sources.filter(source =>
    canMoveCapitalSource(source, destinationAccounts)), [sources, destinationAccounts]);
  const source = sources.find(item => item.id === sourceId);
  const account = destinationAccounts.find(item => item.id === accountId);
  const linkedSource = account?.capital_source_id
    ? sources.find(item => item.id === account.capital_source_id) : null;
  const clearRequest = () => { requestId.current = generateUUID(); setError(''); };
  const confirm = async () => {
    if (busyRef.current || !ready) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Conecte-se à internet para confirmar a movimentação.'); return;
    }
    let amount: number;
    try { amount = parseWalletMoney(amountText, 'valor da transferência'); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Informe um valor válido.'); return;
    }
    const issue = validateCapitalMovement(amount, source, account, destinationAccounts);
    if (issue) { setError(issue); return; }
    if (!window.confirm(`Mover ${formatMoney(amount)} de ${source!.name} para ${account!.nickname} no CapitalFlow? Esta operação registra somente a movimentação contábil, não envia Pix nem transfere dinheiro no banco.`)) return;
    busyRef.current = true; setWorking(true); setError('');
    try {
      await personalWalletService.transferCapitalSourceToAccount({
        profileId, sourceId, accountId, amount, requestId: requestId.current,
      });
      window.dispatchEvent(new Event('capitalflow:wallet-updated'));
      window.dispatchEvent(new Event('capitalflow:source-origins-updated'));
      await onSaved();
      onClose();
    } catch (cause) {
      // Em falha de rede, preservar a chave: repetir não pode debitar novamente.
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a transferência.');
    } finally { busyRef.current = false; setWorking(false); }
  };

  return <Modal title="Transferir capital para conta" subtitle="Movimentação contábil interna — não é Pix ou transferência bancária" onClose={working ? () => {} : onClose} busy={working}
    footer={<button type="button" disabled={!ready || working || !sourceId || !accountId || !amountText.trim()}
      onClick={() => void confirm()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50">
      {working ? <Loader2 size={17} className="animate-spin" /> : <ArrowRightLeft size={17}/>}
      {working ? 'Confirmando...' : 'Confirmar movimentação'}
    </button>}>
    <div className="space-y-4">
      {loading && <p role="status" className="text-sm text-slate-300">Verificando autorização e saldos...</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      {ready && <>
        <div className="rounded-lg bg-slate-900 p-3">
          <p className="text-xs text-slate-400">Capital operacional transferível, sem cartões ou contas espelho</p>
          <strong className="mt-1 block text-xl font-bold tabular-nums text-emerald-300">{formatMoney(getMovableCapitalTotal(sources,destinationAccounts))}</strong>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-200">
          Fonte de origem
          <select value={sourceId} onChange={event => { setSourceId(event.target.value); clearRequest(); }}
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <option value="">Selecione a fonte</option>
            {eligible.map(item => <option key={item.id} value={item.id}>{item.name} · {formatMoney(Number(item.balance))}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-200">
          Conta de destino
          <select value={accountId} onChange={event => { setAccountId(event.target.value); clearRequest(); }}
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <option value="">Selecione a conta</option>
            {destinationAccounts.map(item => <option key={item.id} value={item.id}>{item.nickname} · {formatMoney(Number(item.balance))}</option>)}
          </select>
        </label>
        {linkedSource && <p className="text-xs text-blue-200">Esta conta espelha a fonte {linkedSource.name}; o saldo vinculado será sincronizado. Não conte as duas posições como dinheiro diferente.</p>}
        <label className="block space-y-1.5 text-sm font-medium text-slate-200">
          Valor em reais
          <FinancialCalculatorInput value={amountText}
            onChange={event => { setAmountText(event.target.value); clearRequest(); }}
            placeholder="0,00" centsEntry
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white focus:border-blue-400" />
        </label>
        <p className="text-xs leading-relaxed text-slate-400">A fonte será debitada e a conta creditada, com registro no extrato e auditoria. Não altera contratos, faturas nem movimenta dinheiro na instituição bancária.</p>
      </>}
    </div>
  </Modal>;
};
