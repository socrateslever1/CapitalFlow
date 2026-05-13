
import React, { useState } from 'react';
import { Scale, CheckCircle2, History, TrendingUp, HandCoins, FileText, Scroll, MessageCircle, ShieldCheck, Printer, User, ChevronLeft } from 'lucide-react';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment, LedgerEntry } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { LoanCard } from '../components/cards/LoanCard';
import { StatCard } from '../components/StatCard';
import { formatMoney } from '../utils/formatters';

// Importação das novas vistas
import { ConfissaoDividaView } from '../features/legal/components/ConfissaoDividaView';
import { NotaPromissoriaView } from '../features/legal/components/NotaPromissoriaView';
import { NotificacaoCobrancaView } from '../features/legal/components/NotificacaoCobrancaView';
import { TermoQuitacaoView } from '../features/legal/components/TermoQuitacaoView';
import { LegalProfileView } from '../features/legal/components/LegalProfileView';

interface LegalPageProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  ui: any;
  loanCtrl: any;
  fileCtrl: any;
  onRefresh: () => void;
  onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => void;
  onReviewSignal: (signalId: string, status: 'APROVADO' | 'NEGADO') => void;
  onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
  isStealthMode: boolean;
  showToast: (msg: string, type?: 'error'|'success') => void;
  setActiveTab?: (tab: string) => void;
  goBack?: () => void;
  onNavigate?: (id: string) => void;
}

type LegalSubView = 'OVERVIEW' | 'CONFISSAO' | 'PROMISSORIA' | 'NOTIFICACAO' | 'QUITACAO' | 'PROFILE';

export const LegalPage: React.FC<LegalPageProps> = (props) => {
  const [subView, setSubView] = useState<LegalSubView>('OVERVIEW');

  // FILTRO DEFINITIVO: Usa Engine de Domínio Central
  const legalLoans = props.loans.filter(l => loanEngine.isLegallyActionable(l));
  
  // Estatísticas Rápidas do Setor
  const totalAgreements = legalLoans.length;
  const totalNegotiatedValue = legalLoans.reduce((acc, l) => acc + (l.activeAgreement?.negotiatedTotal || 0), 0);
  const totalReceivedAgreement = legalLoans.reduce((acc, l) => {
      if (!l.activeAgreement) return acc;
      return acc + l.activeAgreement.installments.reduce((sum, i) => sum + i.paidAmount, 0);
  }, 0);

  // Renderização Condicional Baseada na SubView
  if (subView === 'CONFISSAO') return <ConfissaoDividaView loans={props.loans} activeUser={props.activeUser} onBack={() => setSubView('OVERVIEW')} showToast={props.showToast} isStealthMode={props.isStealthMode} />;
  if (subView === 'PROMISSORIA') return <NotaPromissoriaView loans={props.loans} activeUser={props.activeUser} onBack={() => setSubView('OVERVIEW')} isStealthMode={props.isStealthMode} />;
  if (subView === 'NOTIFICACAO') return <NotificacaoCobrancaView loans={props.loans} activeUser={props.activeUser} onBack={() => setSubView('OVERVIEW')} showToast={props.showToast} isStealthMode={props.isStealthMode} />;
  if (subView === 'QUITACAO') return <TermoQuitacaoView loans={props.loans} activeUser={props.activeUser} onBack={() => setSubView('OVERVIEW')} showToast={props.showToast} isStealthMode={props.isStealthMode} />;
  if (subView === 'PROFILE') return <LegalProfileView activeUser={props.activeUser} onBack={() => setSubView('OVERVIEW')} />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20">
                        <Scale size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Jurídico</h1>
                        <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Gestão de Acordos e Recuperação</p>
                    </div>
                </div>
            </div>
            <button 
                onClick={() => setSubView('PROFILE')}
                className="w-full md:w-auto px-6 py-3 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase border border-slate-700"
            >
                <User size={16}/> Perfil Jurídico
            </button>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard 
                variant="compact"
                title="Acordos Ativos" 
                value={totalAgreements.toString()} 
                rawValue={totalAgreements} 
                icon={<History size={20} />} 
                isStealthMode={props.isStealthMode}
                indicatorColor="bg-indigo-500"
            />
            <StatCard 
                variant="compact"
                title="Volume Negociado" 
                value={formatMoney(totalNegotiatedValue, props.isStealthMode)} 
                rawValue={totalNegotiatedValue} 
                icon={<TrendingUp size={20} />} 
                isStealthMode={props.isStealthMode}
                indicatorColor="bg-amber-500"
            />
            <StatCard 
                variant="compact"
                title="Recuperado (Acordos)" 
                value={formatMoney(totalReceivedAgreement, props.isStealthMode)} 
                rawValue={totalReceivedAgreement} 
                icon={<HandCoins size={20} />} 
                isStealthMode={props.isStealthMode}
                indicatorColor="bg-emerald-500"
            />
        </div>

        {/* CENTRAL DE DOCUMENTOS & MODELOS */}
        <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <FileText size={16} className="text-slate-500"/> Protocolos & Documentos
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* DOC 1: Confissão */}
                <button onClick={() => setSubView('CONFISSAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 hover:border-indigo-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all"><Scroll size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-indigo-950 text-indigo-400 px-2 py-1 rounded">Gerar</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Confissão de Dívida</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Instrumento Particular com validade de Título Executivo.</p>
                    </div>
                </button>

                {/* DOC 2: Promissória */}
                <button onClick={() => setSubView('PROMISSORIA')} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 hover:border-blue-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-all"><Printer size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-blue-950 text-blue-400 px-2 py-1 rounded">Imprimir</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Nota Promissória</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Modelos padronizados para impressão e assinatura física.</p>
                    </div>
                </button>

                {/* DOC 3: Notificação */}
                <button onClick={() => setSubView('NOTIFICACAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 hover:border-amber-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all"><MessageCircle size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-amber-950 text-amber-400 px-2 py-1 rounded">Cobrar</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Notificação de Cobrança</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Modelos de avisos amigáveis e extrajudiciais.</p>
                    </div>
                </button>

                {/* DOC 4: Quitação */}
                <button onClick={() => setSubView('QUITACAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 hover:border-emerald-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all"><ShieldCheck size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-emerald-950 text-emerald-400 px-2 py-1 rounded">Recibo</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Termo de Quitação</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Formalização da liquidação total para contratos pagos.</p>
                    </div>
                </button>
            </div>
        </div>

        {/* LISTA DE CONTRATOS EM ACORDO */}
        <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <CheckCircle2 size={16} className="text-slate-500"/> Acordos Ativos
            </h3>
            
            {legalLoans.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-800">
                    <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Scale className="text-slate-500" size={32}/>
                    </div>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Nenhum acordo ativo no momento</p>
                </div>
            ) : (
                <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
                    {legalLoans.map(loan => (
                        <div key={loan.id} className="break-inside-avoid mb-4">
                            <LoanCard
                                loan={loan}
                                sources={props.sources}
                                activeUser={props.activeUser}
                                isExpanded={props.ui.selectedLoanId === loan.id}
                                onToggleExpand={() => props.ui.setSelectedLoanId(props.ui.selectedLoanId === loan.id ? null : loan.id)}
                                onEdit={(loan) => { props.ui.setEditingLoan(loan); props.ui.openModal('LOAN_FORM'); }}
                                onMessage={(loan) => { props.ui.setMessageModalLoan(loan); props.ui.openModal('MESSAGE_HUB'); }}
                                onArchive={(loan) => { props.loanCtrl.openConfirmation({ type: 'ARCHIVE', target: loan, showRefundOption: true }); }}
                                onRestore={(loan) => { props.loanCtrl.openConfirmation({ type: 'RESTORE', target: loan }); }}
                                onDelete={(loan) => { props.loanCtrl.openConfirmation({ type: 'DELETE', target: loan, showRefundOption: true }); }}
                                onNote={(loan) => { props.ui.setNoteModalLoan(loan); props.ui.setNoteText(loan.notes); props.ui.openModal('NOTE'); }}
                                onPortalLink={(loan) => { props.loanCtrl.handleGenerateLink(loan); }}
                                onUploadPromissoria={(loan) => { props.ui.setPromissoriaUploadLoanId(String(loan.id)); props.ui.promissoriaFileInputRef.current?.click(); }}
                                onUploadDoc={(loan) => { props.ui.setExtraDocUploadLoanId(String(loan.id)); props.ui.setExtraDocKind('CONFISSAO'); props.ui.extraDocFileInputRef.current?.click(); }}
                                onViewPromissoria={(url) => { window.open(url, '_blank', 'noreferrer'); }}
                                onViewDoc={(url) => { window.open(url, '_blank', 'noreferrer'); }}
                                onReviewSignal={props.onReviewSignal}
                                onOpenComprovante={props.fileCtrl.handleOpenComprovante}
                                onReverseTransaction={props.onReverseTransaction}
                                onRenegotiate={() => {}}
                                onActivate={props.loanCtrl.handleActivateLoan}
                                onAgreementPayment={props.onAgreementPayment}
                                onRefresh={props.onRefresh}
                                onNavigate={(id) => props.onNavigate?.(`/contrato/${id}`)}
                                onLegalDocument={props.onNavigate}
                                isStealthMode={props.isStealthMode}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};
