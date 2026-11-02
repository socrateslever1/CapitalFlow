import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowRight, CalendarDays, ChevronDown, RefreshCw, Wallet } from 'lucide-react';
import type { CapitalSource, Loan } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { isTestSource } from '../../../utils/testSource';
import { localAccountingMonth, buildMonthlyBalances, type MonthlyBalance } from '../../../domain/finance/monthlyBalance';
import { loadFinancialMovements } from '../../../services/finance/monthlyBalance.service';

interface Props {
  profileId: string;
  loans: Loan[];
  sources: CapitalSource[];
  isStealthMode?: boolean;
  compact?: boolean;
  onOpenLoan?: (loanId: string) => void;
}
const currentMonth = () => localAccountingMonth(new Date().toISOString()) || new Date().toISOString().slice(0, 7);
const monthLabel = (month: string) => {
  const date = new Date(`${month}-15T12:00:00`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date) : month;
};
const empty: (month: string) => MonthlyBalance = month => ({
  month, principal: 0, profit: 0, totalReceived: 0, unclassified: 0, lent: 0,
  withdrawal: 0, loss: 0, expense: 0, reversed: 0, count: 0, entries: [],
});

const Card: React.FC<{title:string; value:number; stealth:boolean; color?:string; description:string}> =
({title,value,stealth,color='text-white',description}) => (
  <div className="min-w-0 rounded-xl border border-slate-700/70 bg-slate-900/65 p-3">
    <p className="text-[10px] font-semibold text-slate-400">{title}</p>
    <p className={`mt-1 break-words text-base font-black tabular-nums sm:text-lg ${color}`}>{formatMoney(value,stealth)}</p>
    <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
  </div>
);

export const MonthlyBalanceReport: React.FC<Props> = ({profileId,loans,sources,isStealthMode=false,compact=false,onOpenLoan}) => {
  const [records,setRecords] = useState<Awaited<ReturnType<typeof loadFinancialMovements>>>([]);
  const [status,setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const [selectedMonth,setSelectedMonth] = useState(currentMonth);
  const [showEntries,setShowEntries] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError('');
    setRecords([]);
    void loadFinancialMovements(profileId,controller.signal).then(data=>{
      if (controller.signal.aborted) return;
      setRecords(data);
      setStatus('ready');
    }).catch((failure: unknown)=>{
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Erro ao consultar o histórico.');
      setStatus('error');
    });
    return () => controller.abort();
  },[profileId,reload]);

  const excludedSourceIds = useMemo(
    () => new Set(sources.filter(isTestSource).map(source=>String(source.id))),
    [sources]
  );
  const balances = useMemo(()=>buildMonthlyBalances(records,excludedSourceIds,profileId),[records,excludedSourceIds]);
  const months = useMemo(()=>{
    const keys = new Set(balances.map(balance=>balance.month));
    keys.add(currentMonth());
    return [...keys].sort((a,b)=>b.localeCompare(a));
  },[balances]);
  const chosen = months.includes(selectedMonth) ? selectedMonth : months[0];
  const period = balances.find(balance=>balance.month===chosen) || empty(chosen);
  const loanNames = useMemo(
    ()=>new Map(loans.map(loan=>[loan.id,loan.debtorName])),
    [loans]
  );
  const sourceNames = useMemo(
    ()=>new Map(sources.map(source=>[source.id,source.name])),
    [sources]
  );
  const money = (amount:number)=>formatMoney(amount,isStealthMode);
  const heading = compact ? 'Recebimentos do mês' : 'Balanço financeiro mensal';

  return <section data-monthly-balance className="min-w-0 rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="rounded-lg bg-blue-500/10 p-2 text-blue-400"><CalendarDays size={19}/></span>
        <div>
          <h2 className="text-base font-bold text-slate-100">{heading}</h2>
          <p className="mt-0.5 text-xs text-slate-400">Valores registrados por data de movimentação, não saldo da conta.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={compact?'balance-month-dashboard':'balance-month-reports'}>Mês do balanço</label>
        <select id={compact?'balance-month-dashboard':'balance-month-reports'}
          value={chosen} onChange={event=>{setSelectedMonth(event.target.value);setShowEntries(false);}}
          className="min-h-10 max-w-[190px] rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white">
          {months.map(month=><option key={month} value={month}>{monthLabel(month)}</option>)}
        </select>
        <button type="button" onClick={()=>setReload(value=>value+1)} aria-label="Recalcular balanço"
          className="grid min-h-10 min-w-10 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300">
          <RefreshCw size={16} className={status==='loading'?'animate-spin':''}/>
        </button>
      </div>
    </div>
    {status==='loading' && <p role="status" className="py-6 text-xs text-slate-400">Consultando movimentações do período…</p>}
    {status==='error' && <p role="alert" className="mt-3 rounded-md border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</p>}
    {status==='ready' && <>
      <div className="mt-4 rounded-lg border border-emerald-600/25 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <ArrowDownLeft size={16}/> Total recebido no mês
        </div>
        <p className="mt-1 text-2xl font-black tabular-nums text-white">{money(period.totalReceived)}</p>
        <p className="mt-1 text-[10px] text-slate-400">Capital recuperado + juros e encargos recebidos, líquidos dos estornos identificados.</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Card title="Capital recuperado" value={period.principal} stealth={isStealthMode}
          description="Retorno do dinheiro emprestado."/>
        <Card title="Lucro realizado" value={period.profit} stealth={isStealthMode} color="text-emerald-300"
          description="Juros e encargos recebidos; não inclui projeções."/>
        <Card title="Capital emprestado" value={period.lent} stealth={isStealthMode} color="text-amber-300"
          description="Novo dinheiro colocado nos contratos. Não é prejuízo."/>
        <Card title="Retiradas do lucro" value={period.withdrawal} stealth={isStealthMode}
          description="Dinheiro retirado do caixa; não reduz o lucro histórico."/>
      </div>
      {(period.loss!==0 || period.expense!==0 || period.unclassified!==0) && <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
        <AlertTriangle size={16} className="mr-2 inline" />
        {period.loss!==0 && <>Perdas efetivamente registradas: {money(period.loss)}. </>}
        {period.expense!==0 && <>Despesas identificadas: {money(period.expense)}. </>}
        {period.unclassified!==0 && <>Movimentações com composição divergente/sem classificação: {money(period.unclassified)}. Não foram incluídas como lucro.</>}
      </div>}
      {!compact && <>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Card title="Despesas" value={period.expense} stealth={isStealthMode}
            color="text-rose-300" description="Despesas registradas, distintas de retiradas de lucro."/>
          <Card title="Perdas reconhecidas" value={period.loss} stealth={isStealthMode}
            color="text-rose-300" description="Somente baixas efetivas; atrasos não são prejuízo automático."/>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">Histórico por mês</h3>
          <p className="text-[10px] text-slate-500">Sem previsão de juros futuros</p>
        </div>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[470px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr><th className="p-2">Mês</th><th className="p-2 text-right">Capital</th>
                <th className="p-2 text-right">Lucro</th><th className="p-2 text-right">Total recebido</th></tr>
            </thead>
            <tbody>{balances.map(balance=><tr key={balance.month} className={balance.month===chosen?'bg-blue-900/20':'border-t border-slate-800'}>
              <td className="p-2"><button type="button" className="text-blue-300 underline-offset-2 hover:underline"
                onClick={()=>{setSelectedMonth(balance.month);setShowEntries(true);}}>{monthLabel(balance.month)}</button></td>
              <td className="p-2 text-right tabular-nums">{money(balance.principal)}</td>
              <td className="p-2 text-right tabular-nums text-emerald-300">{money(balance.profit)}</td>
              <td className="p-2 text-right tabular-nums font-bold">{money(balance.totalReceived)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <button type="button" onClick={()=>setShowEntries(show=>!show)}
        aria-expanded={showEntries} className="mt-3 flex min-h-10 w-full items-center justify-between rounded-lg border border-slate-700 px-3 text-left text-xs font-semibold text-slate-300">
        Rastro das movimentações ({period.count}) <ChevronDown size={16} className={showEntries?'rotate-180':''}/>
      </button>
      {showEntries && <div className="mt-2 max-h-72 space-y-1 overflow-y-auto" data-balance-trace>
        {period.entries.length===0 && <p className="p-3 text-xs text-slate-500">Sem lançamentos classificados neste mês.</p>}
        {period.entries.map(entry=><article key={entry.id} className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-200">
                {entry.loanId ? loanNames.get(entry.loanId) || 'Contrato não identificado' : 'Movimentação sem contrato'}
              </p>
              <p className="text-[10px] text-slate-400">
                {new Date(entry.date).toLocaleDateString('pt-BR',{timeZone:'America/Manaus'})} · {entry.category}
                {entry.sourceId ? ` · ${sourceNames.get(entry.sourceId)||'Fonte não identificada'}` : ''}
              </p>
              <p className="mt-1 break-words text-[10px] text-slate-500">{entry.notes || entry.type} · Ref. {entry.id.slice(0,8)}</p>
            </div>
            <div className="shrink-0 text-right font-bold tabular-nums">
              {entry.principal!==0 && <p className="text-slate-200">Capital {money(entry.principal)}</p>}
              {entry.profit!==0 && <p className="text-emerald-300">Lucro {money(entry.profit)}</p>}
              {entry.lent!==0 && <p className="text-amber-300">Aplicado {money(entry.lent)}</p>}
              {entry.withdrawal!==0 && <p className="text-slate-300">Retirado {money(entry.withdrawal)}</p>}
              {entry.loss!==0 && <p className="text-rose-300">Perda {money(entry.loss)}</p>}
              {entry.expense!==0 && <p className="text-rose-300">Despesa {money(entry.expense)}</p>}
              {entry.unclassified!==0 && <p className="text-amber-300">Revisar {money(entry.unclassified)}</p>}
            </div>
          </div>
          {entry.loanId && onOpenLoan && <button type="button" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300"
            onClick={()=>onOpenLoan(entry.loanId!)}>Ver contrato <ArrowRight size={12}/></button>}
        </article>)}
      </div>}
      <p className="mt-2 flex items-center gap-1 text-[10px] leading-4 text-slate-500">
        <Wallet size={12}/> Relatório contábil de recebimentos. Não representa saldo bancário ou conciliação de depósitos.
      </p>
    </>}
  </section>;
};
