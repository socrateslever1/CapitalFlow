
import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  MessageCircle,
  AlertTriangle,
  BellRing,
  FileSignature,
  X,
  Lock,
  Gavel,
  ChevronRight,
  Wallet,
  Calendar,
  LogOut,
  Building,
  CheckCircle2,
  Trash2
} from 'lucide-react';

import { useClientPortalLogic } from './hooks/useClientPortalLogic';
import { usePortalClientNotifications } from './hooks/usePortalClientNotifications';
import { PortalPaymentModal } from './components/PortalPaymentModal';
import { PortalChatDrawer } from './components/PortalChatDrawer';
import { resolveDebtSummary, resolveInstallmentDebt, getPortalDueLabel } from './mappers/portalDebtRules';
import { PortalInstallmentItem } from '../../containers/ClientPortal/components/PortalInstallmentItem';
import { formatMoney } from '../../utils/formatters';

interface ContractBlockProps {
    loan: any;
    onPay: () => void;
    onChat: () => void;
}

// Componente Interno: Bloco de Contrato Individual
const ContractBlock: React.FC<ContractBlockProps> = ({ loan, onPay, onChat }) => {
    const summary = useMemo(() => resolveDebtSummary(loan, loan.installments), [loan]);
    const { hasLateInstallments, totalDue, pendingCount, nextDueDate } = summary;

    // Pega o status da próxima parcela ou da mais atrasada
    const nextInst = loan.installments.find((i: any) => i.status !== 'PAID');
    const statusInfo = nextInst ? getPortalDueLabel(resolveInstallmentDebt(loan, nextInst).daysLate, nextInst.dueDate) : { label: 'Quitado', variant: 'OK' };

    const isPaidOff = pendingCount === 0;

    return (
        <div className={`border rounded-2xl p-4 transition-all ${hasLateInstallments ? 'bg-rose-950/10 border-rose-500/30' : isPaidOff ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contrato</span>
                        <span className="text-[10px] font-mono text-slate-600">#{loan.id.substring(0,6).toUpperCase()}</span>
                    </div>
                    <h4 className="text-white font-bold text-sm mt-0.5">{loan.billingCycle === 'DAILY_FREE' ? 'Modalidade Diária' : 'Crédito Mensal'}</h4>
                </div>
                <div className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${
                    statusInfo.variant === 'OVERDUE' ? 'bg-rose-500 text-white border-rose-600' :
                    statusInfo.variant === 'DUE_TODAY' ? 'bg-amber-500 text-black border-amber-600' :
                    isPaidOff ? 'bg-emerald-500 text-white border-emerald-600' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                    {isPaidOff ? 'Finalizado' : statusInfo.label}
                </div>
            </div>

            {/* Conteúdo Principal do Card */}
            {!isPaidOff && (
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Total Aberto</p>
                        <p className={`text-xl font-black ${hasLateInstallments ? 'text-rose-400' : 'text-white'}`}>
                            {formatMoney(totalDue)}
                        </p>
                    </div>
                    {nextDueDate && (
                        <div className="text-right">
                            <p className="text-[9px] text-slate-500 uppercase font-bold">Próx. Vencimento</p>
                            <p className="text-xs text-white font-bold">{new Date(nextDueDate).toLocaleDateString('pt-BR')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Lista de Parcelas (Apenas as próximas 2 para economizar espaço) */}
            {!isPaidOff && (
                <div className="space-y-2 mb-4 bg-slate-950/50 p-2 rounded-xl border border-slate-800/50">
                    {loan.installments.filter((i:any) => i.status !== 'PAID').slice(0, 2).map((inst: any) => (
                         <PortalInstallmentItem key={inst.id} loan={loan} installment={inst} />
                    ))}
                    {pendingCount > 2 && (
                        <p className="text-[9px] text-center text-slate-500 italic py-1">...e mais {pendingCount - 2} parcelas</p>
                    )}
                </div>
            )}

            {/* Ações */}
            <div className="grid grid-cols-2 gap-2 mt-2">
                <button 
                    onClick={onPay}
                    disabled={isPaidOff}
                    className={`py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all ${
                        isPaidOff ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 
                        hasLateInstallments ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/20' : 
                        'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                    }`}
                >
                    <Wallet size={14}/> {isPaidOff ? 'Quitado' : 'Pagar Agora'}
                </button>
                <button 
                    onClick={onChat}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all"
                >
                    <MessageCircle size={14}/> Ajuda
                </button>
            </div>
        </div>
    );
};

export const ClientPortalView = ({ initialPortalToken, initialPortalCode }: { initialPortalToken: string; initialPortalCode: string }) => {
  const {
    isLoading,
    portalError,
    loggedClient,
    clientContracts,
    portalDocuments,
    loadFullPortalData,
    handleSignDocument,
    handleViewDocument,
    handleDeleteDocument,
    isSigning
  } = useClientPortalLogic(initialPortalToken, initialPortalCode);

  const [activeLoanForPayment, setActiveLoanForPayment] = useState<any>(null);
  const [activeLoanForChat, setActiveLoanForChat] = useState<any>(null);
  const [isLegalOpen, setIsLegalOpen] = useState(false);

  // --- RESUMO GLOBAL DO CLIENTE ---
  const globalSummary = useMemo(() => {
      let total = 0;
      let lateCount = 0;
      let maxLate = 0;

      clientContracts.forEach(c => {
          const sum = resolveDebtSummary(c, c.installments);
          total += sum.totalDue;
          if (sum.hasLateInstallments) {
              lateCount++;
              if (sum.maxDaysLate > maxLate) maxLate = sum.maxDaysLate;
          }
      });

      return { total, lateCount, maxLate };
  }, [clientContracts]);

  const alertTheme = globalSummary.lateCount > 0;

  // Notificações Baseadas no Global
  const clientNotification = usePortalClientNotifications(initialPortalToken, initialPortalCode, { 
    overdueCount: globalSummary.lateCount, 
    maxDaysLate: globalSummary.maxLate, 
    nextDueDate: null // Global não tem nextDueDate único relevante
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse">Acessando Portal...</p>
      </div>
    );
  }

  if (portalError || !loggedClient) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center">
            <ShieldCheck size={48} className="mx-auto text-rose-500 mb-4" />
            <h2 className="text-white font-black text-xl mb-2">Acesso Indisponível</h2>
            <p className="text-slate-400 text-sm mb-4">{portalError || "Link inválido ou expirado."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center p-0 sm:p-4 overflow-hidden">
      
      {/* NOTIFICAÇÃO TOAST */}
      {clientNotification && clientNotification.length > 0 && clientNotification[0].show && (
          <div className="fixed top-6 left-4 right-4 z-[200] animate-in slide-in-from-top-6 duration-500 pointer-events-none">
             <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border-l-4 border-rose-500 flex items-start gap-3 max-w-sm mx-auto pointer-events-auto ring-1 ring-white/10">
                <div className="p-2 bg-rose-500/10 rounded-full text-rose-500 shrink-0">
                    <BellRing size={18} className="animate-pulse"/>
                </div>
                <div>
                    <h4 className="text-sm font-bold text-white mb-1">Aviso Importante</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{clientNotification[0].message}</p>
                </div>
             </div>
          </div>
      )}

      <div className="w-full max-w-lg bg-slate-900 sm:rounded-[2.5rem] flex flex-col h-full sm:h-[90vh] sm:border border-slate-800 shadow-2xl overflow-hidden relative">
        
        {/* HEADER CLIENTE */}
        <div className="bg-slate-950 border-b border-slate-800 p-5 flex items-center justify-between shrink-0 relative z-10">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-sm shadow-lg border-2 border-slate-900">
                    {loggedClient.name.charAt(0)}
                </div>
                <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Portal do Cliente</p>
                    <h3 className="text-white font-bold text-sm leading-none">{loggedClient.name.split(' ')[0]}</h3>
                </div>
            </div>
            <button onClick={() => window.location.href = '/'} className="p-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl hover:text-white transition-colors">
                <LogOut size={18}/>
            </button>
        </div>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6 relative">
            
            {/* Efeito Background Alerta */}
            {alertTheme && <div className="absolute top-0 right-0 w-full h-64 bg-rose-900/10 blur-[80px] pointer-events-none"></div>}

            {/* RESUMO GLOBAL */}
            {clientContracts.length >= 2 && (
                <div className={`p-6 rounded-[2rem] border relative overflow-hidden transition-all ${alertTheme ? 'bg-gradient-to-br from-rose-950 to-slate-900 border-rose-500/30' : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700'}`}>
                     <div className="relative z-10">
                         <p className={`text-[10px] font-black uppercase mb-1 flex items-center gap-1 ${alertTheme ? 'text-rose-300' : 'text-slate-400'}`}>
                            {alertTheme ? <AlertTriangle size={12}/> : <ShieldCheck size={12}/>} Total Consolidado
                         </p>
                         <p className="text-3xl font-black text-white tracking-tight">{formatMoney(globalSummary.total)}</p>
                         
                         <div className="mt-4 flex gap-2">
                            {globalSummary.lateCount > 0 ? (
                                <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-2 py-1 rounded-lg animate-pulse">
                                    {globalSummary.lateCount} Contratos em Atraso
                                </span>
                            ) : (
                                <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg flex items-center gap-1">
                                    <CheckCircle2 size={10}/> Situação Regular
                                </span>
                            )}
                            <span className="text-[9px] font-black uppercase bg-slate-950/50 text-slate-400 px-2 py-1 rounded-lg">
                                {clientContracts.length} Contratos
                            </span>
                         </div>
                     </div>
                </div>
            )}

            {/* AÇÕES GERAIS */}
            <button onClick={() => setIsLegalOpen(true)} className="w-full bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between group hover:bg-slate-700 transition-all">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all"><FileSignature size={18}/></div>
                    <div className="text-left">
                        <p className="text-xs font-bold text-white uppercase">Meus Documentos</p>
                        <p className="text-[10px] text-slate-500">Visualizar contratos e termos</p>
                    </div>
                </div>
                <ChevronRight size={16} className="text-slate-500"/>
            </button>

            {/* LISTA DE CONTRATOS */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-1">Seus Contratos</h3>
                {clientContracts.length === 0 ? (
                    <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase border-2 border-dashed border-slate-800 rounded-2xl">
                        Nenhum contrato ativo encontrado.
                    </div>
                ) : (
                    clientContracts.map(contract => (
                        <ContractBlock 
                            key={contract.id} 
                            loan={contract}
                            onPay={() => setActiveLoanForPayment(contract)}
                            onChat={() => setActiveLoanForChat(contract)}
                        />
                    ))
                )}
            </div>
            
            {/* CREDOR INFO (Geral, pega do primeiro contrato ativo) */}
            {clientContracts.length > 0 && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50 flex items-center gap-3 opacity-60">
                    <div className="p-2 bg-slate-800 rounded-xl text-slate-400"><Building size={16}/></div>
                    <div className="overflow-hidden flex-1">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Credor Responsável</p>
                        <p className="text-[10px] text-white font-bold truncate">{(clientContracts[0] as any).creditorName || 'Empresa'}</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* MODAL PAGAMENTO (Contextualizado) */}
      {activeLoanForPayment && (
          <PortalPaymentModal 
              portalToken={initialPortalToken}
              portalCode={initialPortalCode}
              loan={activeLoanForPayment} 
              installment={activeLoanForPayment.installments.find((i:any) => i.status!=='PAID') || activeLoanForPayment.installments[0]} 
              clientData={{ name: loggedClient.name, doc: loggedClient.document, id: loggedClient.id }} 
              onClose={() => { setActiveLoanForPayment(null); loadFullPortalData(); }} 
          />
      )}

      {/* DRAWER CHAT (Contextualizado) */}
      <PortalChatDrawer 
          loan={activeLoanForChat ? {
              ...activeLoanForChat,
              clientProfileId: loggedClient?.profileId,
              loggedClientId: loggedClient?.id
          } : null} 
          isOpen={!!activeLoanForChat} 
          onClose={() => setActiveLoanForChat(null)} 
      />

      {/* MODAL JURÍDICO */}
      {isLegalOpen && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-[150] p-4 backdrop-blur-sm">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-indigo-500/30 max-w-lg w-full shadow-2xl animate-in zoom-in-95 relative">
            <button onClick={() => setIsLegalOpen(false)} className="absolute top-6 right-6 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white"><X size={18}/></button>
            <div className="flex flex-col items-center text-center py-6 w-full">
                <Lock size={40} className="text-indigo-500 mb-4"/>
                <h2 className="text-white font-black uppercase text-lg mb-2">Central Jurídica</h2>
                
                <div className="w-full space-y-3 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                    {portalDocuments.length === 0 ? (
                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-slate-500 text-xs font-bold uppercase">
                            Nenhum documento pendente.
                        </div>
                    ) : (
                        portalDocuments.map(doc => (
                            <div key={doc.id} className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 text-left flex justify-between items-center group hover:border-indigo-500/50 transition-all backdrop-blur-sm">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-white font-bold text-xs uppercase">{doc.tipo === 'CONFISSAO' ? 'Confissão de Dívida' : doc.tipo}</h4>
                                        <span className="text-[8px] font-mono text-slate-600">ID: {doc.id.substring(0,4)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        {doc.status_assinatura === 'ASSINADO' ? (
                                            <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 size={10}/> Assinado</span>
                                        ) : (
                                            <span className="text-amber-400 font-bold flex items-center gap-1"><AlertTriangle size={10}/> Pendente</span>
                                        )}
                                        <span className="mx-1">•</span>
                                        {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button 
                                        onClick={() => handleViewDocument(doc.id)}
                                        className="p-2.5 bg-slate-800 text-slate-400 rounded-xl hover:text-white hover:bg-slate-700 transition-all"
                                        title="Visualizar"
                                    >
                                        <ChevronRight size={16}/>
                                    </button>
                                    
                                    {doc.status_assinatura !== 'ASSINADO' ? (
                                        <button 
                                            onClick={() => handleSignDocument(doc.id)}
                                            disabled={isSigning}
                                            className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                                        >
                                            {isSigning ? <RefreshCw size={12} className="animate-spin"/> : 'Assinar'}
                                        </button>
                                    ) : null}

                                    <button 
                                        onClick={() => handleDeleteDocument(doc.id)}
                                        className="p-2.5 bg-slate-900/50 text-slate-600 rounded-xl hover:text-rose-500 hover:bg-rose-500/10 transition-all ml-1"
                                        title="Excluir Documento"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed px-4">
                    Ao assinar, você concorda com os termos e condições estabelecidos nos instrumentos jurídicos acima.
                </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
