import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, Landmark } from 'lucide-react';
import type { PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual, walletAccountTypeLabel } from './walletPresentation';

type Props = { accounts: PersonalWalletAccount[]; onOpen: (account: PersonalWalletAccount) => void };

export const AccountCardStack: React.FC<Props> = ({ accounts, onOpen }) => {
  const [index, setIndex] = useState(0);
  const active = accounts[index] ?? null;
  const total = useMemo(() => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0), [accounts]);
  const cycle = (step: number) => setIndex(current => (current + step + accounts.length) % accounts.length);

  if (!active) return <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Nenhuma conta bancária cadastrada.</div>;
  const visual = getBankVisual(active.institution_key || active.bank_name || active.nickname);
  const rear = accounts.filter(item => item.id !== active.id).slice(0, 3);

  return <section aria-label="Pilha de contas bancárias" className="space-y-3">
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <button type="button" aria-label="Conta anterior" disabled={accounts.length < 2} onClick={() => cycle(-1)} className="rounded-full p-2 text-slate-300 disabled:opacity-30"><ArrowLeft size={18}/></button>
      <div className="relative mx-auto w-full max-w-md" style={{ paddingTop: rear.length * 13 }}>
        {rear.map((account, rearIndex) => {
          const itemVisual = getBankVisual(account.institution_key || account.bank_name || account.nickname);
          return <button key={account.id} type="button" aria-label={`Selecionar ${account.nickname}`} onClick={() => setIndex(accounts.findIndex(item => item.id === account.id))} className="absolute inset-x-0 top-0 mx-auto h-14 rounded-t-2xl border border-white/15 shadow-xl" style={{ zIndex: rearIndex + 1, width: `${92 + rearIndex * 3}%`, transform: `translateY(${rearIndex * 13}px)`, background: itemVisual.accent }}/>
        })}
        <button type="button" onClick={() => onOpen(active)} className="relative z-20 flex aspect-[1.8/1] w-full flex-col justify-between overflow-hidden rounded-2xl border border-white/20 p-5 text-left text-white shadow-2xl" style={{ background: `linear-gradient(135deg, ${visual.accent}, ${visual.secondary})` }}>
          <span className="absolute -right-6 -top-10 text-[8rem] font-black text-white/10">{visual.monogram}</span>
          <span className="relative flex items-center justify-between"><span className="flex items-center gap-2"><span className="rounded-xl bg-white p-1"><BankLogo name={active.bank_name} alternateName={active.nickname} size="sm"/></span><strong>{active.nickname}</strong></span><Landmark size={20}/></span>
          <span className="relative"><small className="block text-[10px] uppercase tracking-wider text-white/70">Saldo disponível</small><strong className="text-2xl font-black">{formatMoney(active.balance)}</strong></span>
          <span className="relative flex items-center justify-between text-[10px] text-white/75"><span>{walletAccountTypeLabel(active.account_type)}</span><span className="flex items-center gap-1"><Copy size={11}/> {active.pix_key ? `PIX ${active.pix_key_type || ''}` : 'PIX não cadastrado'}</span></span>
        </button>
      </div>
      <button type="button" aria-label="Próxima conta" disabled={accounts.length < 2} onClick={() => cycle(1)} className="rounded-full p-2 text-slate-300 disabled:opacity-30"><ArrowRight size={18}/></button>
    </div>
    <div className="flex items-center justify-between text-xs text-slate-400"><span>Saldo total em {accounts.length} conta(s)</span><strong className="text-emerald-300">{formatMoney(total)}</strong></div>
  </section>;
};
