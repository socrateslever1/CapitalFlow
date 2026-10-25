import React, { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, CreditCard, Landmark, X } from 'lucide-react';
import { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { BankLogo } from './BankLogo';
import { getBankVisual, getCreditSummary, groupWalletByBank } from './walletPresentation';

type Props = {
  open: boolean;
  cards: PersonalWalletCard[];
  accounts: PersonalWalletAccount[];
  onClose: () => void;
  onCard: (card: PersonalWalletCard) => void;
  onAccount: (accountId: string) => void;
};

const NetworkMark = ({ brand }: { brand?: string | null }) => {
  const normalized = String(brand || '').toLowerCase();
  if (normalized.includes('master')) return <span aria-label="Mastercard" className="relative inline-block h-5 w-8"><i className="absolute left-0 top-0 h-5 w-5 rounded-full bg-red-500"/><i className="absolute right-0 top-0 h-5 w-5 rounded-full bg-amber-400/90"/></span>;
  if (normalized.includes('visa')) return <span className="rounded bg-white/95 px-2 py-0.5 text-[10px] font-black italic text-blue-800">VISA</span>;
  if (normalized.includes('elo')) return <span className="rounded-full bg-black/80 px-2 py-1 text-[9px] font-black text-white">elo</span>;
  return <CreditCard size={20} className="text-white/80" />;
};

export const WalletCardsSheet: React.FC<Props> = ({ open, cards, accounts, onClose, onCard, onAccount }) => {
  const reduceMotion = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);
  const summary = useMemo(() => getCreditSummary(cards), [cards]);
  const groups = useMemo(() => groupWalletByBank(accounts, cards), [accounts, cards]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  return <AnimatePresence>{open && <div className="fixed inset-0 z-[2300] flex items-end justify-center sm:items-center" role="presentation">
    <motion.button type="button" aria-label="Fechar detalhes dos cartões" className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    <motion.section role="dialog" aria-modal="true" aria-labelledby="wallet-cards-sheet-title" initial={reduceMotion ? { opacity: 0 } : { y: '100%' }} animate={{ y: 0, opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} className="relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[2rem] border border-slate-700/80 bg-slate-900 shadow-2xl sm:rounded-[2rem]">
      <div className="shrink-0 border-b border-slate-800 px-5 pb-4 pt-3">
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-600" />
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-400">Uso do crédito</p><h2 id="wallet-cards-sheet-title" className="mt-1 text-lg font-black leading-tight text-white">Você usou {formatMoney(summary.used)} do limite em {groups.filter(group => group.cards.length).length || cards.length} banco(s)</h2></div><button ref={closeButton} type="button" onClick={onClose} className="rounded-full bg-slate-800 p-2 text-slate-300 hover:text-white"><X size={18}/></button></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700"><motion.div initial={{ width: 0 }} animate={{ width: `${summary.percentage}%` }} className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" /></div>
        <div className="mt-2 flex justify-between text-[11px]"><span className="text-slate-400">Utilizado {formatMoney(summary.used)}</span><span className="font-bold text-white">Total {formatMoney(summary.total)}</span></div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {cards.map(card => {
          const visual = getBankVisual(card.issuer || card.nickname);
          const linked = accounts.find(account => account.id === card.account_id);
          return <button type="button" key={card.id} onClick={() => onCard(card)} className="w-full overflow-hidden rounded-2xl text-left shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
            <div className="relative min-h-24 overflow-hidden p-4 text-white" style={{ background: `linear-gradient(120deg, ${visual.accent}, ${visual.secondary})` }}>
              <div className="absolute -right-3 -top-8 text-[5rem] font-black text-white/10">{visual.monogram}</div>
              <div className="relative flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-full bg-white p-1"><BankLogo name={card.issuer} alternateName={card.nickname} size="sm" /></span><span className="min-w-0"><strong className="block truncate text-sm">{card.nickname}</strong><small className="text-white/70">{linked ? linked.nickname : 'Cartão independente'}</small></span></div><div className="flex items-center gap-2"><NetworkMark brand={card.brand}/><span className="rounded-lg bg-black/35 px-2 py-1 text-[10px] font-bold">•••• {card.last_four || '----'}</span></div></div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-slate-950 px-4 py-3"><div><p className="text-[10px] text-slate-500">Utilizado</p><strong className="text-sm text-white">{formatMoney(card.used_limit)}</strong></div><div className="text-right"><p className="text-[10px] text-slate-500">de {formatMoney(card.credit_limit)}</p><span className="inline-flex items-center gap-1 text-xs font-bold text-blue-400">Ver cartão <ChevronRight size={14}/></span></div></div>
          </button>;
        })}

        {accounts.length > 0 && <div className="border-t border-slate-800 pt-4"><h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Contas de débito e pagamento</h3>{accounts.map(account => <button key={account.id} type="button" onClick={() => onAccount(account.id)} className="flex w-full items-center justify-between rounded-xl p-3 text-left hover:bg-slate-800"><span className="flex min-w-0 items-center gap-2"><Landmark size={16} className="text-emerald-400"/><span className="truncate text-xs font-bold text-white">{account.nickname}</span></span><strong className="text-xs text-emerald-300">{formatMoney(account.balance)}</strong></button>)}</div>}
      </div>
    </motion.section>
  </div>}</AnimatePresence>;
};
