import React, { useEffect, useMemo, useState } from 'react';
import { Scale, CheckCircle2, History, TrendingUp, HandCoins, FileText, Scroll, MessageCircle, ShieldCheck, Printer, User, Edit3, UserX, Clock, PlusCircle, Bell, AlertCircle, Trash2, Download } from 'lucide-react';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment, LedgerEntry } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { supabase } from '../lib/supabase';
import { legalDocumentService } from '../services/legalDocument.service';
import { LoanCard } from '../components/cards/LoanCard';
import { StatCard } from '../components/StatCard';
import { formatMoney } from '../utils/formatters';

// Importação das vistas
import { ConfissaoDividaView } from '../features/legal/components/ConfissaoDividaView';
import { NotaPromissoriaView } from '../features/legal/components/NotaPromissoriaView';
import { NotificacaoCobrancaView } from '../features/legal/components/NotificacaoCobrancaView';
import { TermoQuitacaoView } from '../features/legal/components/TermoQuitacaoView';
import { LegalProfileView } from '../features/legal/components/LegalProfileView';
import { LegalDocumentEditorPage } from './LegalDocumentEditorPage';

interface LegalPageProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  ui: any;
  loanCtrl: any;
  fileCtrl: any;
  onRefresh: () => void;
  onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => void;
  onReviewSignal: (signalId: string, status: 'APROVADO' | 'NEGADO') => void;
  onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
  isStealthMode: boolean;
  showToast: (msg: string, type?: 'error'|'success'|'info'|'warning') => void;
  setActiveTab?: (tab: string) => void;
  goBack?: () => void;
  onNavigate?: (id: string) => void;
}

type LegalSubView = 'OVERVIEW' | 'CONFISSAO' | 'PROMISSORIA' | 'NOTIFICACAO' | 'QUITACAO' | 'PROFILE' | 'EDITOR';
type LegalTab = 'ACTIVE' | 'DOCS' | 'WITHOUT_CONTRACT' | 'FINISHED';

export const LegalPage: React.FC<LegalPageProps> = (props) => {
  const [subView, setSubView] = useState<LegalSubView>('OVERVIEW');
  const [activeTab, setActiveTabState] = useState<LegalTab>('ACTIVE');
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [legalDocs, setLegalDocs] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);

  useEffect(() => {
    const fetchDocsAndClients = async () => {
      try {
        const { data: docs } = await supabase
          .from('documentos_juridicos')
          .select('*')
          .order('created_at', { ascending: false });
        if (docs) setLegalDocs(docs);

        const { data: clientsData } = await supabase
          .from('clientes')
          .select('*');
        if (clientsData) setAllClients(clientsData);
      } catch {
        // ignore
      }
    };
    fetchDocsAndClients();
    const interval = setInterval(fetchDocsAndClients, 3000);
    return () => clearInterval(interval);
  }, []);

  const pendingFeedbacks = useMemo(() => {
    return legalDocs.filter(d => {
      const st = String(d.status_assinatura || d.status || '').toUpperCase();
      return ['AJUSTE_SOLICITADO', 'RECUSADO', 'AJUSTE', 'RECUSA'].includes(st);
    });
  }, [legalDocs]);

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja EXCLUIR este documento do sistema? Esta ação é irreversível.')) return;
    try {
      await legalDocumentService.deleteDoc(docId);
      setLegalDocs(prev => prev.filter(d => d.id !== docId));
      props.showToast('Documento excluído com sucesso!', 'success');
    } catch (e: any) {
      props.showToast(e?.message || 'Erro ao excluir documento.', 'error');
    }
  };

  const handlePrintDocument = (doc: any) => {
    const html = doc?.rendered_html || doc?.snapshot_rendered_html || doc?.snapshot?.html;
    if (!html) {
      props.showToast('Este documento não possui prévia formatada para impressão.', 'warning');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const routedLegalLoanId = useMemo(() => {
    const match = window.location.pathname.match(/^\/legal\/editor\/([a-f0-9-]+)$/i);
    return match ? match[1] : null;
  }, [props.ui.selectedLoanId]);

  useEffect(() => {
    if (routedLegalLoanId) {
      setEditingLoanId(routedLegalLoanId);
      setSubView('EDITOR');
    }
  }, [routedLegalLoanId]);

  // Contratos Ativos / Em andamento (Exibe todos os contratos ativos e pré-contratos)
  const activeLegalLoans = useMemo(() => {
    return props.loans.filter(l => {
      const st = String(l.status || '').toUpperCase();
      const isFinished = st === 'PAID' || st === 'PAGO' || st === 'QUITADO' || st === 'ARQUIVADO' || st === 'ARCHIVED' || (l.activeAgreement as any)?.status === 'COMPLETED' || (l.activeAgreement as any)?.status === 'PAID';
      return !isFinished;
    });
  }, [props.loans]);

  // Clientes / Empréstimos Ativos SEM contrato gerado (Inclui todos os clientes cadastrados sem contrato)
  const loansWithoutContract = useMemo(() => {
    const fromLoans = props.loans.filter(l => {
      const st = String(l.status || '').toUpperCase();
      const isFinished = st === 'PAID' || st === 'PAGO' || st === 'QUITADO' || st === 'ARQUIVADO' || st === 'ARCHIVED';
      const hasAgreement = !!l.activeAgreement;
      return !isFinished && !hasAgreement;
    });

    const loanClientIds = new Set(props.loans.map(l => String(l.clientId || '')));
    const loanClientDocs = new Set(props.loans.map(l => String(l.debtorDocument || '').replace(/\D/g, '')));

    const virtualWithoutContract: Loan[] = [];
    allClients.forEach(c => {
      const cDoc = String(c.document || c.cpf || c.cpf_cnpj || '').replace(/\D/g, '');
      if (!loanClientIds.has(String(c.id)) && (!cDoc || !loanClientDocs.has(cDoc))) {
        virtualWithoutContract.push({
          id: `virtual-client-${c.id}`,
          clientId: c.id,
          debtorName: c.name || c.full_name || c.nome || 'Cliente cadastrado',
          debtorDocument: c.document || c.cpf || c.cpf_cnpj || '',
          principal: 0,
          status: 'PENDING' as any,
          installments: [],
          startDate: c.created_at || new Date().toISOString(),
          notes: 'Cliente cadastrado no sistema (Sem contrato ativo)',
          sourceId: '',
        } as any);
      }
    });

    return [...fromLoans, ...virtualWithoutContract];
  }, [props.loans, allClients]);

  // Contratos Finalizados / Arquivados
  const finishedLegalLoans = useMemo(() => {
    return props.loans.filter(l => {
      const st = String(l.status || '').toUpperCase();
      const isFinished = st === 'PAID' || st === 'PAGO' || st === 'QUITADO' || st === 'ARQUIVADO' || st === 'ARCHIVED' || (l.activeAgreement as any)?.status === 'COMPLETED' || (l.activeAgreement as any)?.status === 'PAID';
      return isFinished;
    });
  }, [props.loans]);

  // Estatísticas Rápidas do Setor
  const totalAgreements = activeLegalLoans.length;
  const totalNegotiatedValue = activeLegalLoans.reduce((acc, l) => acc + (l.activeAgreement?.negotiatedTotal || 0), 0);
  const totalReceivedAgreement = activeLegalLoans.reduce((acc, l) => {
      if (!l.activeAgreement) return acc;
      return acc + l.activeAgreement.installments.reduce((sum, i) => sum + i.paidAmount, 0);
  }, 0);

  const handleOpenEditor = (loanId: string) => {
    setEditingLoanId(loanId);
    setSubView('EDITOR');
  };

  // Renderização Condicional Baseada na SubView
  if (subView === 'EDITOR' && editingLoanId) {
    return (
      <LegalDocumentEditorPage
        loanId={editingLoanId}
        loans={props.loans}
        sources={props.sources}
        activeUser={props.activeUser}
        onBack={() => { setSubView('OVERVIEW'); setEditingLoanId(null); }}
      />
    );
  }

  if (subView === 'CONFISSAO') return <ConfissaoDividaView loans={props.loans} initialLoanId={editingLoanId || routedLegalLoanId || undefined} activeUser={props.activeUser} onBack={() => { setSubView('OVERVIEW'); setEditingLoanId(null); }} showToast={props.showToast} isStealthMode={props.isStealthMode} />;
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
            <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                    onClick={() => setSubView('PROFILE')}
                    className="flex-1 md:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase border border-slate-700"
                >
                    <User size={15}/> Perfil Jurídico
                </button>
            </div>
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

        {/* PAINEL DE NOTIFICAÇÕES DE SOLICITAÇÕES E RECUSAS DOS CLIENTES */}
        {pendingFeedbacks.length > 0 && (
            <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-rose-950/80 border-2 border-indigo-500/40 p-4 rounded-xl shadow-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg relative">
                            <Bell size={20} className="animate-bounce text-indigo-400" />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-black text-[9px] rounded-full flex items-center justify-center">
                                {pendingFeedbacks.length}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-white font-black text-xs uppercase tracking-wider">
                                Notificação do Cliente: {pendingFeedbacks.length} Solicitação(ões) Pendente(s)
                            </h4>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                Clientes enviaram observações, recusas ou pedidos de alteração no contrato.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleOpenEditor(pendingFeedbacks[0].empréstimo_id || pendingFeedbacks[0].loan_id || props.loans[0]?.id || '')}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg transition-all shrink-0"
                    >
                        <Edit3 size={13} /> Editar Minuta do Cliente
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    {pendingFeedbacks.map((fb) => {
                        const st = String(fb.status_assinatura || '').toUpperCase();
                        const isAdj = st === 'AJUSTE_SOLICITADO' || st === 'AJUSTE';
                        const targetLoanId = fb.empréstimo_id || fb.loan_id || props.loans[0]?.id || '';
                        const clientName = fb.snapshot?.client_name || fb.snapshot?.debtorName || fb.observacoes || 'Cliente';

                        return (
                            <div
                                key={fb.id}
                                className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg flex items-center justify-between gap-3 hover:border-indigo-500/40 transition-all"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                            isAdj ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                        }`}>
                                            {isAdj ? 'Ajuste Solicitado' : 'Contrato Recusado'}
                                        </span>
                                        <span className="text-[8px] text-slate-500 font-mono">
                                            {new Date(fb.updated_at || fb.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                    <p className="text-white font-bold text-xs truncate">{clientName}</p>
                                    <p className="text-[9px] text-amber-300 font-medium truncate mt-0.5">
                                        "{fb.observacoes || fb.snapshot?.client_adjustment_request || fb.snapshot?.client_refusal_reason || 'Solicitou revisão no contrato.'}"
                                    </p>
                                </div>

                                <button
                                    onClick={() => handleOpenEditor(targetLoanId)}
                                    className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[8px] font-black uppercase transition-all shrink-0 flex items-center gap-1 border border-indigo-500/30"
                                >
                                    <Edit3 size={11} /> Editar Minuta
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* CENTRAL DE DOCUMENTOS & MODELOS */}
        <div className="space-y-4">
            <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                <FileText size={16} className="text-slate-500"/> Protocolos & Ferramentas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* DOC 1: Confissão */}
                <button onClick={() => setSubView('CONFISSAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex flex-col gap-3 hover:border-indigo-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-all"><Scroll size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-indigo-950 text-indigo-400 px-2 py-1 rounded">Jurídico</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Confissão de Dívida</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Instrumento Particular com validade de Título Executivo.</p>
                    </div>
                </button>

                {/* DOC 2: Promissória */}
                <button onClick={() => setSubView('PROMISSORIA')} className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex flex-col gap-3 hover:border-blue-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-all"><Printer size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-blue-950 text-blue-400 px-2 py-1 rounded">Imprimir</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Nota Promissória</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Modelos padronizados para impressão e assinatura física.</p>
                    </div>
                </button>

                {/* DOC 3: Notificação */}
                <button onClick={() => setSubView('NOTIFICACAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex flex-col gap-3 hover:border-amber-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-all"><MessageCircle size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-amber-950 text-amber-400 px-2 py-1 rounded">Cobrar</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Notificação de Cobrança</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Modelos de avisos amigáveis e extrajudiciais.</p>
                    </div>
                </button>

                {/* DOC 4: Quitação */}
                <button onClick={() => setSubView('QUITACAO')} className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex flex-col gap-3 hover:border-emerald-500 transition-all group text-left">
                    <div className="flex justify-between items-start">
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all"><ShieldCheck size={20}/></div>
                        <span className="text-[9px] font-black uppercase bg-emerald-950 text-emerald-400 px-2 py-1 rounded">Recibo</span>
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">Termo de Quitação</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Formalização da liquidação total para contratos pagos.</p>
                    </div>
                </button>
            </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS DO SETOR JURÍDICO */}
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
                <button
                    onClick={() => setActiveTabState('ACTIVE')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all ${
                        activeTab === 'ACTIVE'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                            : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <Clock size={15} /> Acordos Ativos & Pendentes ({activeLegalLoans.length})
                </button>

                <button
                    onClick={() => setActiveTabState('DOCS')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all ${
                        activeTab === 'DOCS'
                            ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/30'
                            : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <Scroll size={15} /> Documentos & Pré-Contratos Emitidos ({legalDocs.length})
                </button>

                <button
                    onClick={() => setActiveTabState('WITHOUT_CONTRACT')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all ${
                        activeTab === 'WITHOUT_CONTRACT'
                            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-900/30'
                            : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <UserX size={15} /> Clientes sem Contrato ({loansWithoutContract.length})
                </button>

                <button
                    onClick={() => setActiveTabState('FINISHED')}
                    className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase flex items-center gap-2 transition-all ${
                        activeTab === 'FINISHED'
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                            : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <CheckCircle2 size={15} /> Finalizados & Arquivados ({finishedLegalLoans.length})
                </button>
            </div>

            {/* ABA 1: ACORDOS ATIVOS & PENDENTES */}
            {activeTab === 'ACTIVE' && (
                <div>
                    {activeLegalLoans.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800">
                            <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Scale className="text-slate-500" size={28}/>
                            </div>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nenhum acordo ativo em andamento</p>
                        </div>
                    ) : (
                        <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
                            {activeLegalLoans.map(loan => (
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
                                        onRenegotiate={(loan) => {
                                            props.ui.setRenegotiationModalLoans([loan]);
                                            props.ui.openModal('RENEGOTIATION', loan);
                                        }}
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
            )}

            {/* ABA: DOCUMENTOS JURÍDICOS & PRÉ-CONTRATOS EMITIDOS */}
            {activeTab === 'DOCS' && (
                <div>
                    {legalDocs.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800">
                            <Scroll size={32} className="mx-auto text-slate-500 mb-2" />
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nenhum documento jurídico emitido até o momento</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {legalDocs.map((doc) => {
                                const st = String(doc.status_assinatura || doc.status || '').toUpperCase();
                                const isSigned = st === 'ASSINADO';
                                const isAdj = st === 'AJUSTE_SOLICITADO' || st === 'AJUSTE';
                                const isRec = st === 'RECUSADO' || st === 'RECUSA';
                                const clientName = doc.snapshot?.client_name || doc.snapshot?.debtorName || doc.observacoes || 'Cliente';
                                const docType = doc.tipo || doc.type || 'CONFISSAO';
                                const targetLoanId = doc.loan_id || doc.empréstimo_id || props.loans[0]?.id || '';

                                return (
                                    <div key={doc.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 hover:border-indigo-500/40 transition-all shadow-lg">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0 flex-1">
                                                <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                                    isSigned
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : isAdj
                                                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                                        : isRec
                                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                    {isSigned ? 'Assinado' : isAdj ? 'Ajuste Solicitado' : isRec ? 'Recusado' : 'Pendente'}
                                                </span>
                                                <h4 className="text-white font-bold text-base mt-2 truncate">{clientName}</h4>
                                                <p className="text-xs text-indigo-300 font-medium mt-0.5">{docType.replace(/_/g, ' ')}</p>
                                            </div>
                                        </div>

                                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
                                            <span className="text-slate-400 font-medium">Criado em:</span>
                                            <span className="text-white font-mono">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                                        </div>

                                        {doc.observacoes && (
                                            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[10px] text-amber-300 font-medium">
                                                "{doc.observacoes}"
                                            </div>
                                        )}

                                        <div className="pt-2 flex flex-col gap-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => setSubView('CONFISSAO')}
                                                    className="py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase rounded-lg flex items-center justify-center gap-1.5 shadow transition-all"
                                                >
                                                    <Edit3 size={13} /> Editar Minuta
                                                </button>
                                                <button
                                                    onClick={() => handlePrintDocument(doc)}
                                                    className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-[10px] uppercase rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 transition-all"
                                                >
                                                    <Printer size={13} /> Baixar PDF
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteDocument(doc.id)}
                                                className="w-full py-1.5 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white font-black text-[9px] uppercase rounded-lg flex items-center justify-center gap-1 border border-rose-500/20 transition-all"
                                            >
                                                <Trash2 size={12} /> Excluir Documento do Sistema
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ABA 2: CLIENTES SEM CONTRATO */}
            {activeTab === 'WITHOUT_CONTRACT' && (
                <div>
                    {loansWithoutContract.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800">
                            <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                            <p className="text-slate-300 text-xs font-bold uppercase tracking-widest">Todos os clientes ativos possuem contrato formalizado!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {loansWithoutContract.map((loan) => (
                                <div key={loan.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 hover:border-amber-500/40 transition-all shadow-lg">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                Sem Contrato Registrado
                                            </span>
                                            <h4 className="text-white font-bold text-base mt-2">{loan.debtorName || 'Cliente sem nome'}</h4>
                                            <p className="text-xs text-slate-400 mt-0.5">CPF/CNPJ: {loan.debtorDocument || 'Não informado'}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
                                        <span className="text-slate-400 font-medium">Valor Principal:</span>
                                        <span className="text-white font-black">{formatMoney(loan.principal || (loan as any).amount || 0, props.isStealthMode)}</span>
                                    </div>

                                    <div className="pt-2 flex gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingLoanId(loan.id);
                                                setSubView('CONFISSAO');
                                            }}
                                            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all"
                                        >
                                            <PlusCircle size={16} /> Gerar Contrato / Confissão
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ABA 3: CONTRATOS FINALIZADOS / ARQUIVADOS */}
            {activeTab === 'FINISHED' && (
                <div>
                    {finishedLegalLoans.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800">
                            <Clock size={32} className="mx-auto text-slate-600 mb-2" />
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Nenhum contrato finalizado encontrado no histórico</p>
                        </div>
                    ) : (
                        <div className="columns-1 md:columns-2 xl:columns-3 gap-4 opacity-80 hover:opacity-100 transition-opacity">
                            {finishedLegalLoans.map(loan => (
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
                                        onRenegotiate={(loan) => {
                                            props.ui.setRenegotiationModalLoans([loan]);
                                            props.ui.openModal('RENEGOTIATION', loan);
                                        }}
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
            )}
        </div>
    </div>
  );
};
