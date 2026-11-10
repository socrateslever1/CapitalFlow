import React, { useEffect, useMemo, useState } from 'react';
import { Scale, FileText, Scroll, Printer, User, Edit3, Bell, Trash2, MessageCircle, ShieldCheck } from 'lucide-react';
import { Loan, CapitalSource, UserProfile, Agreement, AgreementInstallment, LedgerEntry } from '../types';
import { supabase } from '../lib/supabase';
import { legalDocumentService } from '../services/legalDocument.service';
import { PageHeader } from '../components/ui/PageHeader';

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

export const LegalPage: React.FC<LegalPageProps> = (props) => {
  const [subView, setSubView] = useState<LegalSubView>('OVERVIEW');
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [legalDocs, setLegalDocs] = useState<any[]>([]);

  useEffect(() => {
    const fetchDocsAndClients = async () => {
      try {
        const { data: docs } = await supabase
          .from('documentos_juridicos')
          .select('*')
          .order('created_at', { ascending: false });
        if (docs) setLegalDocs(docs);

      } catch {
        // ignore
      }
    };
    void fetchDocsAndClients();
    const onFocus = () => {
      if (document.visibilityState === 'visible') void fetchDocsAndClients();
    };
    // Legal document status remains fresh without reloading every client and
    // every loan every three seconds when a user is reading the legal tools.
    const interval = window.setInterval(onFocus, 45_000);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const pendingFeedbacks = useMemo(() => {
    return legalDocs.filter(d => {
      const st = String(d.status_assinatura || d.status || '').toUpperCase();
      return ['AJUSTE_SOLICITADO', 'RECUSADO', 'AJUSTE', 'RECUSA'].includes(st);
    });
  }, [legalDocs]);

  const currentLegalDocs = useMemo(
    () => legalDocs.filter((doc) => !['CANCELADO', 'SUPERSEDED', 'SUBSTITUIDO'].includes(
      String(doc.status || doc.status_assinatura || '').toUpperCase(),
    )),
    [legalDocs],
  );

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
        <PageHeader
          icon={<Scale size={22} />}
          iconClassName="border-violet-500/30 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-950/30"
          title="Jurídico"
          subtitle="Gestão de acordos e recuperação"
          actions={<div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                    onClick={() => setSubView('PROFILE')}
                    className="flex-1 md:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase border border-slate-700"
                >
                    <User size={15}/> Perfil Jurídico
                </button>
            </div>}
        />

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

        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Scroll size={17} className="text-indigo-300"/> Documentos jurídicos emitidos
                </h3>
                <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
                    {currentLegalDocs.length} {currentLegalDocs.length === 1 ? 'documento' : 'documentos'}
                </span>
            </div>
            {/* ABA: DOCUMENTOS JURÍDICOS EMITIDOS */}
            <section aria-label="Documentos jurídicos emitidos">
                <div>
                    {currentLegalDocs.length === 0 ? (
                        <div className="text-center py-16 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800">
                            <Scroll size={32} className="mx-auto text-slate-500 mb-2" />
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nenhum documento jurídico emitido até o momento</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {currentLegalDocs.map((doc) => {
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
            </section>

        </div>
    </div>
  );
};
