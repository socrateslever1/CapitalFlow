import React, { useState } from 'react';
import { CreditCard, DollarSign, FileUp, Image as ImageIcon, Maximize2, Plus, Receipt, RotateCw, X } from 'lucide-react';
import type { PersonalWalletAccount, PersonalWalletCard, PersonalWalletExpense, PersonalWalletExpenseInstallment, UpdatePersonalWalletExpense, WalletStatementRow } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { VirtualCreditCard } from './VirtualCreditCard';
import { WalletStatementImport } from './WalletStatementImport';
import { CardInvoiceStatement } from './CardInvoiceStatement';
import { getBankVisual } from './walletPresentation';

export interface CardDetailModalProps {
  card: PersonalWalletCard;
  accounts: PersonalWalletAccount[];
  expenses: PersonalWalletExpense[];
  installments: PersonalWalletExpenseInstallment[];
  invoiceDueMonth?: string | null;
  openInvoiceAmount?: number;
  onClose: () => void;
  onNewExpense: (cardId: string) => void;
  onPayInvoice: (cardId: string) => void;
  statementRows?: WalletStatementRow[];
  onImported?: () => Promise<void>;
  onEditExpense: (input: UpdatePersonalWalletExpense, requestId: string) => Promise<void>;
  onDeleteExpense: (expenseId: string, requestId: string) => Promise<void>;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  accounts,
  expenses,
  installments,
  invoiceDueMonth = null,
  openInvoiceAmount = 0,
  onClose,
  onNewExpense,
  onPayInvoice,
  statementRows = [],
  onImported,
  onEditExpense,
  onDeleteExpense,
}) => {
  const [importOpen, setImportOpen] = useState(false);
  const [activeView, setActiveView] = useState<'CARD' | 'PHOTO'>('CARD');
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
  const usedPercentage = Number(card.credit_limit) > 0 ? Math.min(100, (Number(card.used_limit) / Number(card.credit_limit)) * 100) : 0;
  const invoiceAmount = openInvoiceAmount > 0 ? openInvoiceAmount : Number(card.current_bill || 0);
  const visual = getBankVisual(card.institution_key || card.issuer || card.nickname);
  const miniCardColor = card.primary_color || visual.accent;
  const importedRows = statementRows.filter(row => row.target_kind === 'CARD' && row.target_id === card.id);
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setIsScrolled(current => current ? scrollTop > 20 : scrollTop > 60);
  };

  const cardVisual = <>
    {activeView === 'CARD' ? (
      <div className="space-y-4">
        {/* Cartão Virtual Realista Gerado a partir dos Dados */}
        <VirtualCreditCard card={card} interactive={true} />
        <p className="text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
          <RotateCw size={12} className="text-blue-400" />
          Toque no cartão para alternar entre frente e verso (CVC e tarja).
        </p>
      </div>
    ) : (
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider"><ImageIcon size={13} className="text-blue-400" /> Foto / Comprovante Anexado</span>
          <button type="button" onClick={() => setShowFullPhoto(!showFullPhoto)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"><Maximize2 size={11} /> {showFullPhoto ? 'Reduzir' : 'Ampliar'}</button>
        </div>
        <div onClick={() => setShowFullPhoto(!showFullPhoto)} className="cursor-pointer overflow-hidden rounded-lg border border-slate-800 bg-slate-900 group relative">
          <img src={card.image_url!} alt={`Foto do cartão ${card.nickname}`} className={`w-full object-contain transition-all duration-300 ${showFullPhoto ? 'max-h-[60vh]' : 'max-h-56'}`} />
        </div>
      </div>
    )}
  </>;

  const limitPanel = (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Utilização do Limite ({usedPercentage.toFixed(0)}%)</span>
        <span className="font-extrabold text-emerald-400">{formatMoney(available)} livre</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-500 ${usedPercentage > 90 ? 'bg-rose-500' : usedPercentage > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPercentage}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80"><span className="text-[9px] uppercase font-bold text-slate-400 block">Limite Total</span><strong className="text-xs font-extrabold text-white mt-0.5 block">{formatMoney(card.credit_limit)}</strong></div>
        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80"><span className="text-[9px] uppercase font-bold text-rose-400 block">Usado</span><strong className="text-xs font-extrabold text-rose-300 mt-0.5 block">{formatMoney(card.used_limit)}</strong></div>
        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80"><span className="text-[9px] uppercase font-bold text-emerald-400 block">Disponível</span><strong className="text-xs font-extrabold text-emerald-300 mt-0.5 block">{formatMoney(available)}</strong></div>
      </div>
      <div className="mt-2 pt-3 border-t border-slate-800/60 flex items-center justify-between">
        <div><p className="text-[10px] uppercase font-bold text-slate-400">Fatura Atual</p><p className="text-sm font-black text-amber-300">{formatMoney(invoiceAmount)}</p></div>
        <button type="button" onClick={() => { onClose(); onPayInvoice(card.id); }} className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/40"><DollarSign size={14} /> Pagar Fatura</button>
      </div>
    </div>
  );

  const importButton = onImported ? (
    <button type="button" onClick={() => setImportOpen(true)} className="w-full lg:w-auto flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-900/20 p-3 text-xs font-bold text-cyan-300"><FileUp size={16}/> Importar PDF da fatura para conferência</button>
  ) : null;

  return (
    <div role="dialog" aria-modal="true" data-modal-open="true" className="fixed inset-0 z-[2000] bg-slate-950/90 backdrop-blur-sm animate-in fade-in lg:p-6">
      <div className="mx-auto flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden bg-slate-900 shadow-2xl lg:h-[calc(100dvh-3rem)] lg:rounded-2xl lg:border lg:border-slate-800">
        <div className="hidden shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 p-4 lg:flex">
          <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><CreditCard size={16}/></div><div><h2 className="text-sm font-bold text-white leading-tight">{card.nickname}</h2><p className="text-[10px] text-slate-400">{card.issuer || 'Emissor'} · Final {card.last_four || '----'}</p></div></div>
          <div className="flex items-center gap-2">{card.image_url && <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10px] font-bold"><button type="button" onClick={() => setActiveView('CARD')} className={`px-2 py-1 rounded-md transition-all ${activeView === 'CARD' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Cartão</button><button type="button" onClick={() => setActiveView('PHOTO')} className={`px-2 py-1 rounded-md transition-all ${activeView === 'PHOTO' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Foto</button></div>}<button type="button" onClick={onClose} className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white" aria-label="Fechar"><X size={16}/></button></div>
        </div>

        <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className={`sticky top-0 z-40 flex items-center gap-3 bg-[#0B0E14]/90 px-3 backdrop-blur-md transition-all duration-300 lg:hidden ${isScrolled ? 'h-14 border-b border-white/10 opacity-100' : 'pointer-events-none h-0 overflow-hidden border-transparent opacity-0'}`} aria-hidden={!isScrolled}>
            <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg text-[9px] font-black text-white shadow" style={{ background: `linear-gradient(135deg, ${miniCardColor}, ${visual.secondary})` }}>{visual.monogram}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-white">{card.nickname} · •••• {card.last_four || '----'}</p><p className="truncate text-[10px] text-slate-300">Disponível: {formatMoney(available)} · Fatura: {formatMoney(invoiceAmount)}</p></div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full bg-white/5 p-2 text-slate-300"><X size={16}/></button>
          </div>

          <div className={`flex items-center justify-between border-b border-slate-800 bg-slate-900/95 p-4 transition-all duration-300 lg:hidden ${isScrolled ? 'max-h-0 overflow-hidden border-transparent py-0 opacity-0' : 'max-h-24 opacity-100'}`}>
            <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400"><CreditCard size={16}/></div><div><h2 className="text-sm font-bold text-white leading-tight">{card.nickname}</h2><p className="text-[10px] text-slate-400">{card.issuer || 'Emissor'} · Final {card.last_four || '----'}</p></div></div>
            <button type="button" onClick={onClose} className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white" aria-label="Fechar"><X size={16}/></button>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:gap-6 lg:p-6">
            <aside className="space-y-4 lg:col-span-5 lg:self-start lg:sticky lg:top-6">
              {cardVisual}
              {limitPanel}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { onClose(); onNewExpense(card.id); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20"><Plus size={15}/> Despesa</button>
                <button type="button" onClick={() => { onClose(); onPayInvoice(card.id); }} className="w-full py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"><Receipt size={15} className="text-amber-400"/> Pagar Fatura</button>
              </div>
            </aside>

            <main className="min-w-0 space-y-4 lg:col-span-7">
              <CardInvoiceStatement cardId={card.id} dueMonth={invoiceDueMonth} expenses={expenses} installments={installments} onEdit={onEditExpense} onDelete={onDeleteExpense} headerAction={importButton} className="m-0" />
              {onImported && <p className="text-[11px] text-slate-400 lg:hidden">{importedRows.length} lançamentos do PDF importados para consulta, sem somar à fatura já cadastrada.</p>}
              {importedRows.length > 0 && <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Conferência do PDF</h3><p className="mt-1 text-[11px] text-slate-500">{importedRows.length} lançamentos importados para consulta, sem somar à fatura cadastrada.</p><div className="mt-3 max-h-52 divide-y divide-slate-800 overflow-y-auto">{importedRows.slice(0, 50).map(row => <div key={row.id} className="flex justify-between gap-3 py-2 text-xs"><div className="min-w-0"><p className="truncate text-slate-200">{row.description}</p><p className="text-[10px] text-slate-500">{row.entry_date.split('-').reverse().join('/')} · {row.category}</p></div><span className={row.amount >= 0 ? 'shrink-0 text-emerald-300' : 'shrink-0 text-rose-300'}>{formatMoney(Math.abs(Number(row.amount)))}</span></div>)}</div></section>}
            </main>
          </div>
        </div>
      </div>
      {importOpen && onImported && (
        <WalletStatementImport kind="CARD" targetId={card.id} targetName={card.nickname} onClose={() => setImportOpen(false)} onImported={onImported} />
      )}
    </div>
  );
};
