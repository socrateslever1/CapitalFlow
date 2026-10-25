import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  Plus, 
  Receipt, 
  DollarSign, 
  Eye, 
  Maximize2,
  Image as ImageIcon,
  RotateCw,
  FileUp
} from 'lucide-react';
import type { PersonalWalletCard, PersonalWalletAccount } from '../../services/personalWallet.service';
import { formatMoney } from '../../utils/formatters';
import { VirtualCreditCard } from './VirtualCreditCard';
import { WalletStatementImport } from './WalletStatementImport';
import type { WalletStatementRow } from '../../services/personalWallet.service';

export interface CardDetailModalProps {
  card: PersonalWalletCard;
  accounts: PersonalWalletAccount[];
  openInvoiceAmount?: number;
  onClose: () => void;
  onNewExpense: (cardId: string) => void;
  onPayInvoice: (cardId: string) => void;
  statementRows?: WalletStatementRow[];
  onImported?: () => Promise<void>;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  accounts,
  openInvoiceAmount = 0,
  onClose,
  onNewExpense,
  onPayInvoice,
  statementRows = [],
  onImported,
}) => {
  const [importOpen,setImportOpen] = useState(false);
  const [activeView, setActiveView] = useState<'CARD' | 'PHOTO'>('CARD');
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  const available = Math.max(0, Number(card.credit_limit) - Number(card.used_limit));
  const usedPercentage = Number(card.credit_limit) > 0
    ? Math.min(100, (Number(card.used_limit) / Number(card.credit_limit)) * 100)
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
      className="fixed inset-0 z-[2000] flex flex-col justify-end sm:justify-center sm:items-center bg-slate-950/85 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-hidden"
    >
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border-0 sm:border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto max-h-[100dvh] sm:max-h-[92dvh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <CreditCard size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">{card.nickname}</h2>
              <p className="text-[10px] text-slate-400">
                {card.issuer || 'Emissor'} · Final {card.last_four || '----'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {card.image_url && (
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveView('CARD')}
                  className={`px-2 py-1 rounded-md transition-all ${activeView === 'CARD' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Cartão
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('PHOTO')}
                  className={`px-2 py-1 rounded-md transition-all ${activeView === 'PHOTO' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Foto
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>

        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
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
            /* Visualização da Foto Real Anexada */
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <ImageIcon size={13} className="text-blue-400" />
                  Foto / Comprovante Anexado
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullPhoto(!showFullPhoto)}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Maximize2 size={11} /> {showFullPhoto ? 'Reduzir' : 'Ampliar'}
                </button>
              </div>

              <div 
                onClick={() => setShowFullPhoto(!showFullPhoto)}
                className="cursor-pointer overflow-hidden rounded-lg border border-slate-800 bg-slate-900 group relative"
              >
                <img
                  src={card.image_url!}
                  alt={`Foto do cartão ${card.nickname}`}
                  className={`w-full object-contain transition-all duration-300 ${
                    showFullPhoto ? 'max-h-[60vh]' : 'max-h-56'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Gestão do Limite e Fatura */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                Utilização do Limite ({usedPercentage.toFixed(0)}%)
              </span>
              <span className="font-extrabold text-emerald-400">
                {formatMoney(available)} livre
              </span>
            </div>

            {/* Barra de Progresso do Limite */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  usedPercentage > 90
                    ? 'bg-rose-500'
                    : usedPercentage > 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${usedPercentage}%` }}
              />
            </div>

            {/* Grid de Resumo */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[9px] uppercase font-bold text-slate-400 block">Limite Total</span>
                <strong className="text-xs font-extrabold text-white mt-0.5 block">{formatMoney(card.credit_limit)}</strong>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[9px] uppercase font-bold text-rose-400 block">Usado</span>
                <strong className="text-xs font-extrabold text-rose-300 mt-0.5 block">{formatMoney(card.used_limit)}</strong>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[9px] uppercase font-bold text-emerald-400 block">Disponível</span>
                <strong className="text-xs font-extrabold text-emerald-300 mt-0.5 block">{formatMoney(available)}</strong>
              </div>
            </div>

            {/* Fatura em Aberto */}
            <div className="mt-2 pt-3 border-t border-slate-800/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Fatura Atual</p>
                <p className="text-sm font-black text-amber-300">
                  {formatMoney(openInvoiceAmount > 0 ? openInvoiceAmount : Number(card.current_bill || 0))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPayInvoice(card.id);
                }}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
              >
                <DollarSign size={14} /> Pagar Fatura
              </button>
            </div>
          </div>
        </div>

        {onImported && <div className="px-4 pb-3 space-y-2">
          <button type="button" onClick={()=>setImportOpen(true)} className="w-full flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-900/20 p-3 text-xs font-bold text-cyan-300">
            <FileUp size={16}/> Importar PDF da fatura para conferência
          </button>
          <p className="text-[11px] text-slate-400">{statementRows.filter(row=>row.target_id===card.id).length} lançamentos do PDF importados para consulta, sem somar à fatura já cadastrada.</p>
          {statementRows.filter(row=>row.target_kind==='CARD'&&row.target_id===card.id).length>0 &&
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/70 px-3">
              {statementRows.filter(row=>row.target_kind==='CARD'&&row.target_id===card.id).slice(0,50).map(row=>(
                <div key={row.id} className="flex justify-between gap-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-slate-200">{row.description}</p>
                    <p className="text-[10px] text-slate-500">{row.entry_date.split('-').reverse().join('/')} · {row.category}</p>
                  </div>
                  <span className={row.amount>=0?'shrink-0 text-emerald-300':'shrink-0 text-rose-300'}>{formatMoney(Math.abs(Number(row.amount)))}</span>
                </div>
              ))}
            </div>}
        </div>}
        {/* Footer com Ações Diretas - Sticky e Livre de interferências */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900/95 shrink-0 grid grid-cols-2 gap-2 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNewExpense(card.id);
            }}
            className="w-full py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30"
          >
            <Plus size={15} /> + Despesa no Cartão
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onPayInvoice(card.id);
            }}
            className="w-full py-2.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
          >
            <Receipt size={15} className="text-amber-400" /> Pagar Fatura
          </button>
        </div>
      </div>
      {importOpen && onImported && <WalletStatementImport kind="CARD" targetId={card.id} targetName={card.nickname} onClose={()=>setImportOpen(false)} onImported={onImported}/>}
    </div>
  );
};
