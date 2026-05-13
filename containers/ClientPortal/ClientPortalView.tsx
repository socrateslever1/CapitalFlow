import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  FileText,
  User,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientPortalLogic } from '../../features/portal/hooks/useClientPortalLogic';
import { usePortalClientNotifications } from '../../features/portal/hooks/usePortalClientNotifications';
import { usePortalPushNotifications } from '../../features/portal/hooks/usePortalPushNotifications';
import { notificationService } from '../../services/notification.service';
import { PortalPaymentModal } from '../../features/portal/components/PortalPaymentModal';
import { PortalChatDrawer } from '../../features/portal/components/PortalChatDrawer';
import { resolveDebtSummary, resolveInstallmentDebt, getPortalDueLabel, isPortalInstallmentPaid } from '../../features/portal/mappers/portalDebtRules';
import { PortalInstallmentItem } from './components/PortalInstallmentItem';
import { PortalEducationalAI } from '../../features/portal/components/PortalEducationalAI';
import { formatMoney } from '../../utils/formatters';
import { legalDocumentService } from '../../services/legalDocument.service';

interface ClientPortalViewProps {
  initialPortalToken: string;
  initialPortalCode: string;
}

interface ContractBlockProps {
  loan: any;
  onPay: () => void;
}

const ContractBlock: React.FC<ContractBlockProps> = ({ loan, onPay }) => {
  const summary = useMemo(() => {
    const insts = (loan.activeAgreement && (loan.activeAgreement.status === 'ACTIVE' || loan.activeAgreement.status === 'ATIVO'))
      ? (loan.activeAgreement.installments || [])
      : loan.installments;
    return resolveDebtSummary(loan, insts);
  }, [loan]);

  const { hasLateInstallments, totalDue, pendingCount, nextDueDate } = summary;
  
  const installmentsToShow = useMemo(() => {
    if (loan.activeAgreement && (loan.activeAgreement.status === 'ACTIVE' || loan.activeAgreement.status === 'ATIVO')) {
      return loan.activeAgreement.installments || [];
    }
    return loan.installments;
  }, [loan]);

  const nextInst = installmentsToShow.find((i: any) => !isPortalInstallmentPaid(i));
  const statusInfo = nextInst
    ? getPortalDueLabel(resolveInstallmentDebt(loan, nextInst).daysLate, nextInst.dueDate)
    : { label: 'Quitado', variant: 'OK' };
  const isPaidOff = pendingCount === 0;

  return (
    <div
      className={`relative group border rounded-[2rem] p-6 transition-all duration-500 overflow-hidden ${
        hasLateInstallments
          ? 'bg-rose-950/10 border-rose-500/20 hover:border-rose-500/40'
          : isPaidOff
          ? 'bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40'
          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Background Glow Effect */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 blur-[50px] opacity-10 rounded-full transition-all duration-700 group-hover:scale-150 ${
        hasLateInstallments ? 'bg-rose-500' : isPaidOff ? 'bg-emerald-500' : 'bg-blue-500'
      }`}></div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Contrato</span>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-950/50 px-2 py-0.5 rounded-md border border-slate-800/50">#{loan.id.substring(0, 6).toUpperCase()}</span>
          </div>
          <h4 className="text-white font-black text-sm uppercase tracking-tight">
            {loan.activeAgreement ? 'Renegociação Ativa' : (loan.billingCycle === 'DAILY_FREE' ? 'Crédito Flexível' : 'Crédito Mensal')}
          </h4>
        </div>

        <div
          className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border tracking-widest ${
            statusInfo.variant === 'OVERDUE'
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
              : statusInfo.variant === 'DUE_TODAY'
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
              : isPaidOff
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          }`}
        >
          {isPaidOff ? 'Finalizado' : statusInfo.label}
        </div>
      </div>

      {!isPaidOff && (
        <div className="flex justify-between items-end mb-6 relative z-10">
          <div>
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1">Saldo Aberto</p>
            <p className={`text-2xl font-black tracking-tighter ${hasLateInstallments ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.2)]' : 'text-white'}`}>
              {formatMoney(totalDue)}
            </p>
          </div>

          {nextDueDate && (
            <div className="text-right">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mb-1 text-right">Vencimento</p>
              <div className="flex items-center gap-1.5 justify-end text-white/90">
                <Calendar size={12} className="opacity-50" />
                <p className="text-xs font-black">{new Date(nextDueDate).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!isPaidOff && (
        <div className="space-y-2 mb-6 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/30 backdrop-blur-sm relative z-10">
          {installmentsToShow
            .filter((i: any) => !isPortalInstallmentPaid(i))
            .slice(0, 2)
            .map((inst: any) => (
              <PortalInstallmentItem key={inst.id} loan={loan} installment={inst} />
            ))}

          {pendingCount > 2 && (
            <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/20 mt-1">
                <div className="h-px flex-1 bg-slate-800/30"></div>
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Contém mais {pendingCount - 2} parcelas</p>
                <div className="h-px flex-1 bg-slate-800/30"></div>
            </div>
          )}
        </div>
      )}

      <div className="relative z-10">
        <button
          onClick={onPay}
          disabled={isPaidOff}
          className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-3 transition-all duration-300 ${
            isPaidOff
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              : hasLateInstallments
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-900/30 active:scale-95'
              : 'bg-white hover:bg-blue-50 text-slate-950 shadow-xl shadow-white/5 active:scale-95'
          }`}
        >
          <Wallet size={16} /> 
          {isPaidOff ? 'Contrato Liquidado' : 'Regularizar Agora'}
          <ArrowRight size={14} className="ml-1 opacity-50" />
        </button>
      </div>
    </div>
  );
};

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({ initialPortalToken, initialPortalCode }) => {
  if (initialPortalToken === 'VALIDATING') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse">Autenticando Acesso...</p>
      </div>
    );
  }

  if (initialPortalToken === 'INVALID_ACCESS') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-rose-500/5 blur-[100px] pointer-events-none"></div>
          <ShieldCheck size={56} className="mx-auto text-rose-500 mb-6" />
          <h2 className="text-white font-black text-2xl uppercase tracking-tighter mb-2">Acesso Restrito</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">Este link de acesso ÃƒÂ© invÃƒÂ¡lido ou jÃƒÂ¡ expirou por razÃƒÂµes de seguranÃƒÂ§a.</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all border border-slate-700"
          >
            Voltar ao InÃƒÂ­cio
          </button>
        </div>
      </div>
    );
  }

  return (
    <ClientPortalViewContent
      initialPortalToken={initialPortalToken}
      initialPortalCode={initialPortalCode}
    />
  );
};

const ClientPortalViewContent: React.FC<ClientPortalViewProps> = ({ initialPortalToken, initialPortalCode }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  if (initialPortalToken === 'INVALID_ACCESS') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-rose-500/5 blur-[100px] pointer-events-none"></div>
          <ShieldCheck size={56} className="mx-auto text-rose-500 mb-6" />
          <h2 className="text-white font-black text-2xl uppercase tracking-tighter mb-2">Acesso Restrito</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">Este link de acesso é inválido ou já expirou por razões de segurança.</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all border border-slate-700"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  const { isLoading, portalError, loggedClient, clientContracts, loadFullPortalData } =
    useClientPortalLogic(initialPortalToken, initialPortalCode);

  const [activeLoanForPayment, setActiveLoanForPayment] = useState<any>(null);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [docList, setDocList] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [legalDocsError, setLegalDocsError] = useState<string | null>(null);
  const portalHistoryReadyRef = useRef(false);

  const exitPortal = useCallback(() => {
    window.history.replaceState(null, '', '/');
    window.location.assign('/');
  }, []);

  const restorePortalGuard = useCallback(() => {
    window.history.pushState({ cfPortalGuard: true }, '', window.location.href);
  }, []);

  const confirmPortalExit = useCallback(() => {
    return window.confirm('Deseja sair do portal do cliente?');
  }, []);

  useEffect(() => {
    if (!isLoading && loggedClient) {
      notificationService.requestPermission();
    }
  }, [isLoading, loggedClient]);

  useEffect(() => {
    if (portalHistoryReadyRef.current) return;

    const currentState = window.history.state ?? {};
    window.history.replaceState({ ...currentState, cfPortalBase: true }, '', window.location.href);
    restorePortalGuard();
    portalHistoryReadyRef.current = true;
  }, [restorePortalGuard]);

  const loadDocs = async () => {
    setLoadingDocs(true);
    setLegalDocsError(null);
    try {
      const docs = await legalDocumentService.listDocs(initialPortalToken, initialPortalCode);
      setDocList(docs);
    } catch (e: any) {
      setDocList([]);
      setLegalDocsError(e?.message || 'Falha ao carregar documentos jurídicos.');
    } finally {
      setLoadingDocs(false);
    }
  };

  const openPublicLegalDocument = useCallback((doc: any) => {
    const publicToken = doc?.view_token || doc?.public_access_token;

    if (!publicToken) {
      setLegalDocsError('Este documento nao possui token publico de assinatura.');
      return;
    }

    const params = new URLSearchParams({
      legal_sign: publicToken,
      role: 'DEBTOR',
      portal: initialPortalToken,
      portal_code: initialPortalCode,
    });

    window.location.assign(`/?${params.toString()}`);
  }, [initialPortalCode, initialPortalToken]);

  useEffect(() => {
    if (isLegalOpen) loadDocs();
  }, [isLegalOpen]);

  useEffect(() => {
    const handlePopState = () => {
      if (isLegalOpen) {
        setIsLegalOpen(false);
        restorePortalGuard();
        return;
      }

      if (activeLoanForPayment) {
        setActiveLoanForPayment(null);
        loadFullPortalData();
        restorePortalGuard();
        return;
      }

      if (isChatOpen) {
        setIsChatOpen(false);
        restorePortalGuard();
        return;
      }

      if (!confirmPortalExit()) {
        restorePortalGuard();
        return;
      }

      exitPortal();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    isLegalOpen,
    activeLoanForPayment,
    isChatOpen,
    loadFullPortalData,
    confirmPortalExit,
    restorePortalGuard,
    exitPortal,
  ]);

  usePortalPushNotifications(clientContracts, loggedClient?.id || null);

  const globalSummary = useMemo(() => {
    let total = 0;
    let lateCount = 0;
    let maxLate = 0;
    let nextDueDate: Date | null = null;

    clientContracts.forEach((c) => {
      const sum = resolveDebtSummary(c, c.installments);
      total += sum.totalDue;
      if (sum.hasLateInstallments) {
        lateCount++;
        if (sum.maxDaysLate > maxLate) maxLate = sum.maxDaysLate;
      }
      if (sum.nextDueDate) {
        const d = new Date(sum.nextDueDate);
        if (!nextDueDate || d < nextDueDate) nextDueDate = d;
      }
    });

    return { total, lateCount, maxLate, nextDueDate };
  }, [clientContracts]);

  const alertTheme = globalSummary.lateCount > 0;

  const clientNotifications = usePortalClientNotifications(initialPortalToken, initialPortalCode, {
    overdueCount: globalSummary.lateCount,
    maxDaysLate: globalSummary.maxLate,
    nextDueDate: globalSummary.nextDueDate
  });

  const contato_whatsapp = useMemo(() => {
    return clientContracts[0]?.contato_whatsapp || null;
  }, [clientContracts]);

  const handleSupportAction = () => {
    if (contato_whatsapp) {
      const msg = `Olá, sou ${loggedClient.name} e preciso de suporte com meu contrato.`;
      const cleanPhone = contato_whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone.startsWith('55') ? '' : '55'}${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      setIsChatOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse tracking-[0.3em]">CapitalFlow</p>
      </div>
    );
  }

  if (portalError || !loggedClient) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-rose-500/5 blur-[100px] pointer-events-none"></div>
          <AlertTriangle size={56} className="mx-auto text-rose-500 mb-6" />
          <h2 className="text-white font-black text-2xl uppercase tracking-tighter mb-2">Sessão Indisponível</h2>
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">Não foi possível carregar os dados deste contrato.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center p-0 sm:p-6 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.05),transparent_50%)]"></div>

      {clientNotifications.length > 0 && (
        <div className="fixed top-8 left-4 right-4 z-[200] pointer-events-none flex flex-col items-center">
          <div className="relative w-full max-w-sm h-28">
            <AnimatePresence mode="popLayout">
              {clientNotifications.map((notif, idx) => {
                const offset = idx * 10;
                const scale = 1 - idx * 0.05;
                const opacity = 1 - idx * 0.3;
                const isRose = notif.type === 'WARNING';

                return (
                  <motion.div
                    key={notif.id}
                    initial={{ y: -40, opacity: 0, scale: 0.8 }}
                    animate={{ 
                      y: offset, 
                      opacity: opacity, 
                      scale: scale,
                      zIndex: clientNotifications.length - idx 
                    }}
                    exit={{ y: -100, opacity: 0, transition: { duration: 0.3 } }}
                    className={`absolute inset-x-0 bg-slate-900/95 backdrop-blur-xl text-white p-5 rounded-[1.5rem] shadow-2xl border flex items-start gap-4 pointer-events-auto ring-1 ring-white/10 ${
                      isRose ? 'border-rose-500/30 shadow-rose-950/20' : 'border-amber-500/30 shadow-amber-950/20'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      isRose ? 'bg-rose-500/10 text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      <BellRing size={20} className={isRose ? 'animate-pulse' : ''} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-white mb-1">
                        {isRose ? 'Alerta Crítico' : 'Lembrete Útil'}
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-tight pr-4">{notif.message}</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="w-full max-w-lg bg-slate-900/10 sm:rounded-[3rem] flex flex-col h-full sm:h-[92vh] sm:border border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden relative backdrop-blur-3xl">
        <div className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50 p-6 flex items-center justify-between shrink-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-lg shadow-xl border-2 border-slate-900 relative">
              {loggedClient.name.charAt(0)}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-950 rounded-full"></div>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.25em] mb-0.5">Área do Cliente</p>
              <h3 className="text-white font-black text-base tracking-tight leading-none truncate max-w-[180px]">
                Olá, {loggedClient.name.split(' ')[0]}
              </h3>
            </div>
          </div>

          <button
            onClick={() => {
              if (confirmPortalExit()) {
                exitPortal();
              }
            }}
            className="p-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl hover:text-rose-400 hover:border-rose-500/20 transition-all active:scale-90"
            title="Sair do Portal"
          >
            <LogOut size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 relative pb-32">
          {alertTheme && <div className="absolute top-0 right-0 w-full h-80 bg-rose-500/5 blur-[120px] pointer-events-none"></div>}

          <div
            className={`p-8 rounded-[2.5rem] border relative overflow-hidden transition-all duration-700 shadow-2xl ${
              alertTheme 
                ? 'bg-gradient-to-br from-rose-950/30 to-slate-900/50 border-rose-500/20' 
                : 'bg-gradient-to-br from-slate-800/20 to-slate-900 border-slate-800'
            }`}
          >
            {/* Gloss Effect */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-white/5 skew-y-[-10deg] -translate-y-full -translate-x-1/2 rotate-12 blur-2xl"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${alertTheme ? 'text-rose-300' : 'text-slate-500'}`}>
                  {alertTheme ? <AlertTriangle size={14} className="animate-pulse" /> : <ShieldCheck size={14} className="text-blue-500" />} 
                  Posição Financeira
                </p>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                    <ArrowRight size={12} className="text-white/30" />
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-white text-lg font-black opacity-30 tracking-widest">R$</span>
                <p className="text-4xl font-black text-white tracking-tighter leading-none">
                    {formatMoney(globalSummary.total).replace('R$', '').trim()}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {globalSummary.lateCount > 0 ? (
                  <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-3 py-1.5 rounded-full shadow-lg shadow-rose-900/30">
                    {globalSummary.lateCount} em atraso
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase bg-emerald-500 text-white px-3 py-1.5 rounded-full shadow-lg shadow-emerald-900/20 flex items-center gap-1.5">
                    <CheckCircle2 size={12} /> Situação Regular
                  </span>
                )}

                <span className="text-[9px] font-black uppercase bg-slate-950/60 text-slate-400 px-3 py-1.5 rounded-full border border-slate-800 shadow-sm">
                  {clientContracts.length} Ativos
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => setIsLegalOpen(true)}
                className="group relative bg-slate-900/50 border border-slate-800 p-5 rounded-[2rem] flex items-center justify-between hover:bg-slate-800 hover:border-slate-700 transition-all duration-300 overflow-hidden"
              >
                 <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full group-hover:bg-indigo-500/10 transition-all"></div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl group-hover:bg-indigo-500 group-hover:text-white transition-all transform group-hover:scale-110 shadow-lg">
                    <FileSignature size={22} />
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-black text-white uppercase tracking-wider">Centro Jurídico</p>
                    <p className="text-[10px] text-slate-500 font-bold">Ver contratos e termos assinados</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
              </button>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-2 mb-2 flex items-center gap-2">
               <div className="w-1 h-1 bg-slate-500 rounded-full"></div> Seus Contratos
            </h3>

            {clientContracts.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/20 border-2 border-dashed border-slate-800/50 rounded-[2.5rem]">
                <RefreshCw size={24} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-600 text-[11px] font-black uppercase tracking-widest">Aguardando novos lançamentos</p>
              </div>
            ) : (
              clientContracts.map((contract) => (
                <ContractBlock
                  key={contract.id}
                  loan={contract}
                  onPay={() => setActiveLoanForPayment(contract)}
                />
              ))
            )}
          </div>

          <PortalEducationalAI contracts={clientContracts} clientName={loggedClient.name} />

          {clientContracts.length > 0 && (
            <div className="bg-slate-950/40 p-5 rounded-[2rem] border border-slate-800/30 flex items-center gap-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-800/10 blur-3xl rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
              <div className="p-3 bg-slate-900 rounded-2xl text-slate-500 shadow-inner">
                <Building size={20} />
              </div>
              <div className="overflow-hidden flex-1 relative z-10">
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Instituição Credora</p>
                <p className="text-[11px] text-slate-100 font-black truncate tracking-wide">
                    {(clientContracts[0] as any).creditorName || 'CapitalFlow Soluções Financeiras'}
                </p>
              </div>
            </div>
          )}
        </div>
        
        {/* Botão de Suporte (WhatsApp do Operador ou Chat Interno) */}
        <button
          onClick={handleSupportAction}
          className="fixed bottom-8 right-6 w-16 h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.5rem] shadow-[0_20px_40px_rgba(16,185,129,0.3)] flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 z-[100] group overflow-hidden"
        >
           <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
           <MessageCircle size={28} className="relative z-10 group-hover:rotate-12 transition-transform" />
           <div className="absolute top-1 right-1 w-3 h-3 bg-emerald-400 border-2 border-emerald-600 rounded-full animate-pulse"></div>
        </button>
      </div>

      {activeLoanForPayment && (
        <PortalPaymentModal
          portalToken={initialPortalToken}
          portalCode={initialPortalCode}
          loan={activeLoanForPayment}
          installment={
            activeLoanForPayment.installments.find((i: any) => !isPortalInstallmentPaid(i)) || activeLoanForPayment.installments[0]
          }
          clientData={{ name: loggedClient.name, doc: loggedClient.document, id: loggedClient.id }}
          onClose={() => {
            setActiveLoanForPayment(null);
            loadFullPortalData();
          }}
        />
      )}

      {/* NOVO CHAT GLOBAL (PortalChatDrawer agora redesenhado) */}
      {isChatOpen && (
        <PortalChatDrawer 
            loan={clientContracts[0] || { client_id: loggedClient.id }} 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)} 
        />
      )}

      {isLegalOpen && (
        <div className="fixed inset-0 bg-slate-950/98 flex items-center justify-center z-[250] p-4 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="bg-slate-900 border border-indigo-500/20 rounded-[3rem] shadow-2xl relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400">
                        <Gavel size={24} />
                    </div>
                    <div>
                        <h2 className="text-white font-black uppercase text-base tracking-tight leading-none">Central Jurídica</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Sua Regularidade</p>
                    </div>
                </div>
                <button
                  onClick={() => setIsLegalOpen(false)}
                  className="p-3 bg-slate-950/50 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-inner"
                >
                  <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              <div className="bg-gradient-to-br from-indigo-500/10 to-transparent p-6 rounded-[2rem] border border-indigo-500/20 text-center relative overflow-hidden group">
                <Lock className="mx-auto text-indigo-400 mb-2 relative z-10" size={32} />
                <h4 className="text-white font-black text-sm uppercase tracking-wide relative z-10">Assinatura Eletrônica</h4>
                <p className="text-[10px] text-slate-400 mt-2 font-medium leading-relaxed relative z-10">
                    Seus documentos são criptografados e possuem validade jurídica conforme a lei vigente.
                </p>
              </div>

              {loadingDocs ? (
                <div className="py-20 flex flex-col items-center gap-4">
                  <RefreshCw className="animate-spin text-indigo-500 w-10 h-10" />
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest animate-pulse">Sincronizando Arquivos...</p>
                </div>
              ) : legalDocsError ? (
                <div className="w-full bg-rose-500/5 border border-rose-500/20 rounded-[2rem] p-6 text-center">
                  <AlertTriangle className="mx-auto text-rose-500 mb-2" size={32} />
                  <p className="text-rose-100 text-xs font-bold leading-tight mb-4">{legalDocsError}</p>
                  <button
                    onClick={loadDocs}
                    className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-rose-900/30 transition-all"
                  >
                    Tentar Sincronização
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {docList.length === 0 ? (
                    <div className="py-20 text-center">
                        <CheckCircle2 size={32} className="mx-auto text-slate-800 mb-3" />
                        <p className="text-slate-600 text-xs font-black uppercase tracking-widest">Nenhuma pendência encontrada</p>
                    </div>
                  ) : (
                    docList.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => openPublicLegalDocument(doc)}
                        className="w-full p-5 bg-slate-950/40 hover:bg-slate-800 border border-slate-800/50 rounded-[2rem] flex items-center justify-between group transition-all"
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className={`p-3 rounded-2xl shadow-lg transition-colors ${
                              (doc.status_assinatura || '').toUpperCase() === 'ASSINADO' 
                              ? 'bg-emerald-500/10 text-emerald-500' 
                              : 'bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white'
                          }`}>
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-white uppercase tracking-tight">{doc.tipo || 'Instrumento Jurídico'}</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Criado em {new Date(doc.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>

                        {(doc.status_assinatura || '').toUpperCase() === 'ASSINADO' ? (
                          <div className="flex flex-col items-end gap-1">
                              <CheckCircle2 size={18} className="text-emerald-500" />
                              <span className="text-[7px] text-emerald-500/60 font-black uppercase tracking-widest">Assinado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-amber-500 text-slate-950 px-3 py-1.5 rounded-full shadow-lg shadow-amber-900/20">
                             <span className="text-[8px] uppercase font-black tracking-widest">Pendente</span>
                             <ChevronRight size={12} />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
