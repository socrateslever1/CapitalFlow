import React, { useEffect, useMemo, useState } from 'react';
import { Scale, FileText, Scroll, Printer, User, Edit3, Bell, Trash2, MessageCircle, ShieldCheck, Archive, ArchiveRestore, Loader2 } from 'lucide-react';
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
  const [archivedDocIds, setArchivedDocIds] = useState<Set<string>>(new Set());
  const [signedDocIds, setSignedDocIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState('');
  const [legalLoadError, setLegalLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchDocsAndClients = async () => {
      try {
        const { data: docs, error: documentError } = await supabase
          .from('documentos_juridicos')
          .select('id,profile_id,loan_id,client_id,acordo_id,tipo,tipo_documento,status,status_assinatura,created_at,document_origin,locked_at,signed_at,uploaded_signed_file_path,snapshot,snapshot_json,snapshot_rendered_html')
          .order('created_at', { ascending: false });
        if (documentError) throw documentError;
        const ids=(docs || []).map(doc => String(doc.id));
        const [archived, signatures] = await Promise.all([
          legalDocumentService.listArchivedDocIds(),
          ids.length ? supabase.from('assinaturas_documento')
            .select('document_id').in('document_id', ids) : Promise.resolve({ data: [], error: null }),
        ]);
        if (signatures.error) throw signatures.error;
        if (!active) return;
        setLegalDocs(docs || []);
        setArchivedDocIds(new Set(archived));
        setSignedDocIds(new Set((signatures.data || []).map(item => String(item.document_id))));
        setLegalLoadError('');
      } catch (error) {
        if (!active) return;
        setLegalLoadError(error instanceof Error ? error.message : 'Não foi possível consultar os documentos.');
      }
    };
    void fetchDocsAndClients();
    const onFocus = () => {
      if (document.visibilityState === 'visible') void fetchDocsAndClients();
    };
    const interval = window.setInterval(onFocus, 45_000);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const pendingFeedbacks = useMemo(() => legalDocs.filter(doc =>
    ['AJUSTE_SOLICITADO', 'RECUSADO', 'AJUSTE', 'RECUSA'].includes(
      String(doc.status_assinatura || doc.status || '').toUpperCase(),
    ),
  ), [legalDocs]);

  const isDocumentArchived = (doc: any) => archivedDocIds.has(String(doc.id))
    || ['CANCELADO', 'SUPERSEDED', 'SUBSTITUIDO'].includes(
      String(doc.status_assinatura || doc.status || '').toUpperCase(),
    );
  const activeLegalDocs = legalDocs.filter(doc => !isDocumentArchived(doc));
  const archivedLegalDocs = legalDocs.filter(isDocumentArchived);
  const currentLegalDocs = showArchived ? archivedLegalDocs : activeLegalDocs;

  const handleArchiveDocument = async (docId: string) => {
    if (!window.confirm('Arquivar este documento apenas da lista ativa? Assinaturas e histórico serão preservados.')) return;
    setBusyDocumentId(docId);
    try {
      await legalDocumentService.archiveDoc(docId);
      setArchivedDocIds(prev => new Set([...prev, docId]));
      props.showToast('Documento arquivado. Os dados e assinaturas foram preservados.', 'success');
    } catch (error: any) {
      props.showToast(error?.message || 'Não foi possível arquivar o documento.', 'error');
    } finally {
      setBusyDocumentId('');
    }
  };

  const handleRestoreDocument = async (docId: string) => {
    setBusyDocumentId(docId);
    try {
      await legalDocumentService.restoreDoc(docId);
      setArchivedDocIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      props.showToast('Documento restaurado na lista ativa.', 'success');
    } catch (error: any) {
      props.showToast(error?.message || 'Não foi possível restaurar.', 'error');
    } finally {
      setBusyDocumentId('');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const doc=legalDocs.find(item => item.id===docId);
    if (!doc) return;
    if (doc.status_assinatura!=='PENDENTE' || signedDocIds.has(docId)
      || doc.signed_at || doc.locked_at || doc.uploaded_signed_file_path || doc.acordo_id) {
      props.showToast('Este documento possui proteção jurídica. Use Arquivar para ocultá-lo sem destruir a prova.', 'error');
      return;
    }
    if (!window.confirm('Excluir definitivamente esta minuta pendente, sem assinatura? Esta ação remove o registro e não pode ser desfeita.')) return;
    setBusyDocumentId(docId);
    try {
      await legalDocumentService.deleteDoc(docId);
      setLegalDocs(prev => prev.filter(item => item.id !== docId));
      props.showToast('Minuta pendente excluída e confirmada pelo banco.', 'success');
    } catch (error: any) {
      props.showToast(error?.message || 'O banco não confirmou a exclusão.', 'error');
    } finally {
      setBusyDocumentId('');
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

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Scroll size={17} className="text-indigo-300"/> Documentos jurídicos registrados
            </h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar documentos jurídicos">
              <button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)}
                className={'min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold ' + (!showArchived ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300')}>
                Ativos ({activeLegalDocs.length})
              </button>
              <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived(true)}
                className={'min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold ' + (showArchived ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300')}>
                Arquivados e cancelados ({archivedLegalDocs.length})
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-300">Documentos gerados não são necessariamente assinados. Arquivar apenas retira da lista ativa; excluir definitivamente só é permitido para minuta pendente, própria e sem assinaturas ou vínculos protegidos.</p>
          {legalLoadError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-200">Falha ao atualizar documentos: {legalLoadError}</p>}
          <section aria-label="Documentos jurídicos registrados">
            {currentLegalDocs.length === 0
              ? <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-300">Nenhum documento nesta categoria.</p>
              : <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {currentLegalDocs.map(doc => {
                  const st = String(doc.status_assinatura || doc.status || '').toUpperCase();
                  const signed = st === 'ASSINADO';
                  const partial = signedDocIds.has(String(doc.id));
                  const type = String(doc.tipo || doc.tipo_documento || 'TIPO NÃO IDENTIFICADO').replace(/_/g, ' ');
                  const sourceName = doc.document_origin === 'UPLOADED_SIGNED'
                    ? 'Arquivo assinado enviado' : 'Documento gerado no sistema';
                  const related = props.loans.find(loan => loan.id === doc.loan_id);
                  const clientName = doc.snapshot?.client_name || doc.snapshot?.debtorName
                    || doc.snapshot_json?.client_name || doc.snapshot_json?.debtorName
                    || related?.debtorName || 'Cliente não identificado';
                  const archivedByUser = archivedDocIds.has(String(doc.id));
                  const automaticallyCanceled = ['CANCELADO','SUPERSEDED','SUBSTITUIDO'].includes(st);
                  const canDelete = doc.status_assinatura === 'PENDENTE' && !partial
                    && !doc.signed_at && !doc.locked_at && !doc.uploaded_signed_file_path && !doc.acordo_id;
                  const canEdit = canDelete && Boolean(related) && String(doc.tipo || doc.tipo_documento || '').toUpperCase()==='CONFISSAO';
                  const isOwn = doc.profile_id === props.activeUser?.profile_id || doc.profile_id === props.activeUser?.id;
                  return <li key={doc.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-bold text-white">{clientName}</p>
                        <p className="mt-1 text-xs text-indigo-300">{type}</p>
                        <p className="mt-1 text-xs text-slate-300">{sourceName} · {new Date(doc.created_at).toLocaleDateString('pt-BR', {timeZone:'America/Manaus'})}</p>
                      </div>
                      <span className={'rounded-md border px-2 py-1 text-[10px] font-semibold ' + (signed ? 'border-emerald-600/40 text-emerald-300' : st==='PENDENTE' ? 'border-amber-600/40 text-amber-300' : 'border-slate-600 text-slate-300')}>
                        {signed ? 'Assinado' : partial ? 'Assinatura parcial' : st==='EM_ASSINATURA' ? 'Em assinatura' : automaticallyCanceled ? 'Cancelado' : 'Pendente'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit && <button type="button" onClick={() => { setEditingLoanId(related!.id);setSubView('EDITOR'); }}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Edit3 size={14}/> Editar minuta</button>}
                      <button type="button" onClick={() => handlePrintDocument(doc)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200"><Printer size={14}/> Imprimir / salvar PDF</button>
                      {isOwn && !archivedByUser && !automaticallyCanceled && <button type="button" disabled={busyDocumentId===doc.id} onClick={() => void handleArchiveDocument(doc.id)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">
                        {busyDocumentId===doc.id ? <Loader2 className="animate-spin" size={14}/> : <Archive size={14}/>} Arquivar
                      </button>}
                      {isOwn && archivedByUser && !automaticallyCanceled && <button type="button" disabled={busyDocumentId===doc.id} onClick={() => void handleRestoreDocument(doc.id)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">
                        <ArchiveRestore size={14}/> Restaurar
                      </button>}
                      {isOwn && canDelete && <button type="button" disabled={busyDocumentId===doc.id} onClick={() => void handleDeleteDocument(doc.id)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 disabled:opacity-50">
                        <Trash2 size={14}/> Excluir minuta pendente
                      </button>}
                    </div>
                    {partial && !signed && <p className="mt-2 text-xs text-amber-300">Há assinatura registrada: o documento pode ser arquivado, não apagado.</p>}
                  </li>;
                })}
              </ul>}
          </section>

        </div>
    </div>
  );
};
