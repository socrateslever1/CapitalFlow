import React, { useMemo, useState } from 'react';
import { ChevronDown, CreditCard, Landmark } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { groupWalletByBank } from './walletPresentation';

type Props = {
  accounts: PersonalWalletAccount[];
  cards: PersonalWalletCard[];
  onAccount: (id: string) => void;
  onCard: (card: PersonalWalletCard) => void;
};

export const BankStack: React.FC<Props> = ({ accounts, cards, onAccount, onCard }) => {
  const groups = useMemo(() => groupWalletByBank(accounts, cards), [accounts, cards]);
  const [open, setOpen] = useState<string | null>(null);
  if (!groups.length) return null;

  return <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
    <div className="mb-3 flex items-end justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-400">Instituições</p><h2 className="text-base font-black text-white">Sua carteira bancária</h2></div>
      <span className="text-[10px] text-slate-500">Toque para abrir</span>
    </div>
    <div className="space-y-2">
      {groups.map((group, index) => {
        const expanded = open === group.key;
        const balance = group.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
        return <div key={group.key} className="overflow-hidden rounded-2xl border border-white/10 transition-all" style={{ marginTop: index && !expanded ? '-.45rem' : undefined }}>
          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.key)}
            className="relative flex min-h-20 w-full items-center justify-between overflow-hidden p-4 text-left text-white"
            style={{ background: `linear-gradient(135deg, ${group.visual.accent}, ${group.visual.secondary})` }}>
            <span className="absolute -right-5 -top-9 text-[5.5rem] font-black text-white/10">{group.visual.monogram}</span>
            <span className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-white/95 text-sm font-black" style={{ color: group.visual.accent }}>{group.visual.monogram}</span><span><strong className="block text-sm">{group.visual.name}</strong><small className="text-white/75">{group.accounts.length} conta(s) · {group.cards.length} cartão(ões)</small></span></span>
            <span className="relative flex items-center gap-3"><strong className="text-sm">{formatMoney(balance)}</strong><ChevronDown size={18} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} /></span>
          </button>
          {expanded && <div className="space-y-1 bg-slate-900 p-2">
            {group.accounts.map(account => <button key={account.id} type="button" onClick={() => onAccount(account.id)} className="flex w-full items-center justify-between rounded-xl p-3 text-left hover:bg-slate-800"><span className="flex items-center gap-2 text-xs font-bold text-white"><Landmark size={15} className="text-emerald-400" />{account.nickname}</span><span className="text-xs font-bold text-emerald-300">{formatMoney(account.balance)}</span></button>)}
            {group.cards.map(card => <button key={card.id} type="button" onClick={() => onCard(card)} className="flex w-full items-center justify-between rounded-xl p-3 text-left hover:bg-slate-800"><span className="flex items-center gap-2 text-xs font-bold text-white"><CreditCard size={15} className="text-blue-400" />{card.nickname}{!card.account_id && <small className="font-normal text-slate-500">independente</small>}</span><span className="text-[10px] text-slate-400">•••• {card.last_four || '----'}</span></button>)}
          </div>}
        </div>;
      })}
    </div>
  </section>;
};
