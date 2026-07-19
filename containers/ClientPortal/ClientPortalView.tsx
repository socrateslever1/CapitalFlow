import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Building,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSignature,
  FileText,
  FolderOpen,
  Gavel,
  LogOut,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatBRDate } from '../../utils/dateHelpers';
import { formatMoney } from '../../utils/formatters';
import { translateBillingCycle } from '../../utils/translationHelpers';
import { useClientPortalLogic } from '../../features/portal/hooks/useClientPortalLogic';
import { usePortalClientNotifications } from '../../features/portal/hooks/usePortalClientNotifications';
import { usePortalPushNotifications } from '../../features/portal/hooks/usePortalPushNotifications';
import {
  getPortalDueLabel,
  isPortalInstallmentPaid,
  resolveDebtSummary,
  resolveInstallmentDebt,
  resolvePaymentOptions,
} from '../../features/portal/mappers/portalDebtRules';
import { PortalChatDrawer } from '../../features/portal/components/PortalChatDrawer';
import { PortalEducationalAI } from '../../features/portal/components/PortalEducationalAI';
import { notificationService } from '../../services/notification.service';
import { legalDocumentService } from '../../services/legalDocument.service';
import { portalService } from '../../services/portal.service';
import { PortalInstallmentItem } from './components/PortalInstallmentItem';

interface ClientPortalViewProps {
  initialPortalToken: string;
  initialPortalCode: string;
}

interface ContractRowProps {
  loan: any;
  expanded: boolean;
  onToggle: () => void;
  onPay: () => Promise<void>;
  isProcessingPayment: boolean;
}

const getStatusClasses = (variant: string, isPaidOff: boolean) => {
  if (isPaidOff) return 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10';
  if (variant === 'OVERDUE') return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  if (variant === 'DUE_TODAY') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
  return 'text-blue-300 border-blue-500/25 bg-blue-500/10';
};

const ContractRow: React.FC<ContractRowProps> = ({
  loan,
  expanded,
  onToggle,
  onPay,
  isProcessingPayment,
}) => {
  const installments = useMemo(() => {
    if (loan.activeAgreement && ['ACTIVE', 'ATIVO'].includes(String(loan.activeAgreement.status || '').toUpperCase())) {
      return loan.activeAgreement.installments || [];
    }
    return loan.installments || [];
  }, [loan]);

  const summary = useMemo(() => resolveDebtSummary(loan, installments), [loan, installments]);
  const nextInstallment = installments.find((item: any) => !isPortalInstallmentPaid(item));
  const statusInfo = nextInstallment
    ? getPortalDueLabel(resolveInstallmentDebt(loan, nextInstallment).daysLate, nextInstallment.dueDate)
    : { label: 'Quitado', variant: 'OK' };
  const isPaidOff = summary.pendingCount === 0;
  const statusClasses = getStatusClasses(statusInfo.variant, isPaidOff);

  return (
    <div className="border-b border-slate-800/80 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 text-left grid grid-cols-[36px_minmax(0,1fr)] gap-3 items-center group"
          aria-expanded={expanded}
        >
          <span
            className={`h-9 w-9 rounded-full border flex items-center justify-center shrink-0 ${statusClasses}`}
          >
            {isPaidOff ? <CheckCircle2 size={18} /> : statusInfo.variant === 'OVERDUE' ? <AlertTriangle size={18} /> : <Calendar size={17} />}
          </span>

          <span className="min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-black uppercase tracking-[0.11em] text-white truncate">
                {loan.activeAgreement ? 'Renegociação' : translateBillingCycle(loan.billingCycle)}
              </span>
              <span className="text-[9px] font-mono text-blue-400/80 shrink-0">
                #{String(loan.id || '').slice(0, 6).toUpperCase()}
              </span>
            </span>
            <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
              <span>{summary.pendingCount} parcela{summary.pendingCount === 1 ? '' : 's'} em aberto</span>
              <span className="text-slate-700">•</span>
              <span className={isPaidOff ? 'text-emerald-400' : statusInfo.variant === 'OVERDUE' ? 'text-rose-400' : statusInfo.variant === 'DUE_TODAY' ? 'text-amber-300' : 'text-slate-400'}>
                {isPaidOff ? 'Liquidado' : statusInfo.label}
              </span>
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right">
            <p className={`text-sm font-black tabular-nums ${summary.hasLateInstallments ? 'text-rose-400' : 'text-white'}`}>
              {formatMoney(summary.totalDue)}
            </p>
            {!isPaidOff && summary.nextDueDate && (
              <p className="mt-0.5 text-[9px] font-bold text-slate-500">
                Vence {formatBRDate(summary.nextDueDate)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="h-8 w-8 rounded-full border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 flex items-center justify-center transition-colors"
            aria-label={expanded ? 'Recolher detalhes' : 'Abrir detalhes'}
          >
            <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-4 border-l-2 border-blue-500/40 bg-slate-950/35">
              <div className="px-3 py-2 border-b border-slate-800/70 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-500">Parcelas</span>
                {!isPaidOff && (
                  <button
                    type="button"
                    onClick={onPay}
                    disabled={isProcessingPayment}
                    className={`px-3 py-1.5 text-[9px] uppercase tracking-wider font-black rounded-md transition-all ${
                      isProcessingPayment
                        ? 'bg-slate-800 text-slate-400 cursor-wait'
                        : summary.hasLateInstallments
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isProcessingPayment ? 'Gerando…' : 'Pagar agora'}
                  </button>
                )}
              </div>
              {installments.map((installment: any) => (
                <PortalInstallmentItem key={installment.id} loan={loan} installment={installment} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LoadingState = () => (
  <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center gap-4 p-4">
    <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.32em]">CapitalFlow</p>
  </div>
);

const AccessError = ({ invalid = false }: { invalid?: boolean }) => (
  <div className="min-h-screen bg-[#020817] flex items-center justify-center p-5">
    <div className="w-full max-w-sm border-y border-slate-800 py-10 text-center">
      {invalid ? <ShieldCheck size={48} className="mx-auto text-rose-500 mb-5" /> : <AlertTriangle size={48} className="mx-auto text-rose-500 mb-5" />}
      <h2 className="text-white font-black text-xl uppercase tracking-tight">
        {invalid ? 'Acesso restrito' : 'Sessão indisponível'}
      </h2>
      <p className="text-slate-400 text-sm mt-3 leading-relaxed">
        {invalid
          ? 'Este link é inválido ou expirou por segurança.'
          : 'Não foi possível carregar os dados deste portal.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.assign('/')}
        className="mt-7 px-6 py-3 border border-slate-700 text-white text-[10px] uppercase tracking-widest font-black hover:bg-slate-900 transition-colors"
      >
        Voltar ao início
      </button>
    </div>
  </div>
);

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({ initialPortalToken, initialPortalCode }) => {
  if (initialPortalToken === 'VALIDATING') return <LoadingState />;
  if (initialPortalToken === 'INVALID_ACCESS') return <AccessError invalid />;

  return (
    <ClientPortalViewContent
      initialPortalToken={initialPortalToken}
      initialPortalCode={initialPortalCode}
    />
  );
};

const ClientPortalViewContent: React.FC<ClientPortalViewProps> = ({ initialPortalToken, initialPortalCode }) => {
  const { isLoading, portalError, loggedClient, clientContracts, loadFullPortalData } =
    useClientPortalLogic(initialPortalToken, initialPortalCode);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [processingPaymentLoanId, setProcessingPaymentLoanId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [docList, setDocList] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [legalDocsError, setLegalDocsError] = useState<string | null>(null);
  const portalHistoryReadyRef = useRef(false);

  const openFile = useCallback((url: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const allOperatorFiles = useMemo(() => {
    const files: any[] = [];
    clientContracts.forEach((contract: any) => {
      const portalFiles = Array.isArray(contract.portalFiles) ? contract.portalFiles : [];
      portalFiles.forEach((file: any) => {
        if (
          file.direction === 'OPERATOR_TO_CLIENT' &&
          ['VISIBLE', 'APPROVED'].includes(String(file.status || '').toUpperCase())
        ) {
          files.push({ ...file, contractId: contract.id, billingCycle: contract.billingCycle });
        }
      });
    });
    return files;
  }, [clientContracts]);

  const exitPortal = useCallback(() => {
    window.history.replaceState(null, '', '/');
    window.location.assign('/');
  }, []);

  const restorePortalGuard = useCallback(() => {
    window.history.pushState({ cfPortalGuard: true }, '', window.location.href);
  }, []);

  const confirmPortalExit = useCallback(() => window.confirm('Deseja sair do portal do cliente?'), []);

  useEffect(() => {
    if (!isLoading && loggedClient) notificationService.requestPermission();
  }, [isLoading, loggedClient]);

  useEffect(() => {
    if (portalHistoryReadyRef.current) return;
    const currentState = window.history.state ?? {};
    window.history.replaceState({ ...currentState, cfPortalBase: true }, '', window.location.href);
    restorePortalGuard();
    portalHistoryReadyRef.current = true;
  }, [restorePortalGuard]);

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    setLegalDocsError(null);
    try {
      const docs = await legalDocumentService.listDocs(initialPortalToken, initialPortalCode);
      setDocList(docs);
    } catch (error: any) {
      setDocList([]);
      setLegalDocsError(error?.message || 'Falha ao carregar documentos jurídicos.');
    } finally {
      setLoadingDocs(false);
    }
  }, [initialPortalCode, initialPortalToken]);

  const openPublicLegalDocument = useCallback(
    (doc: any) => {
      const publicToken = doc?.view_token || doc?.public_access_token;
      if (!publicToken) {
        setLegalDocsError('Este documento não possui token público de assinatura.');
        return;
      }

      const params = new URLSearchParams({
        legal_sign: publicToken,
        role: 'DEBTOR',
        portal: initialPortalToken,
        portal_code: initialPortalCode,
      });
      window.location.assign(`/?${params.toString()}`);
    },
    [initialPortalCode, initialPortalToken],
  );

  useEffect(() => {
    if (isLegalOpen) loadDocs();
  }, [isLegalOpen, loadDocs]);

  useEffect(() => {
    const handlePopState = () => {
      if (isLegalOpen) {
        setIsLegalOpen(false);
        restorePortalGuard();
        return;
      }
      if (isFilesOpen) {
        setIsFilesOpen(false);
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
  }, [confirmPortalExit, exitPortal, isChatOpen, isFilesOpen, isLegalOpen, loadFullPortalData, restorePortalGuard]);

  usePortalPushNotifications(clientContracts, loggedClient?.id || null);

  const handleInfinitePay = useCallback(
    async (loan: any) => {
      const installment = (loan.installments || []).find((item: any) => !isPortalInstallmentPaid(item));
      if (!installment) {
        setPaymentError('Este contrato não possui parcela em aberto.');
        return;
      }

      const amount = resolvePaymentOptions(loan, installment).totalToPay;
      if (!Number.isFinite(amount) || amount <= 0.05) {
        setPaymentError('Não foi encontrado valor válido para pagamento.');
        return;
      }

      setPaymentError(null);
      setProcessingPaymentLoanId(loan.id);

      try {
        const checkout = await portalService.createInfinitePayCheckout(
          initialPortalToken,
          initialPortalCode,
          loan.id,
          installment.id,
          amount,
          {
            name: loggedClient.name,
            doc: loggedClient.document,
            email: loggedClient.email,
            phone: loggedClient.phone,
            id: loggedClient.id,
          },
        );
        window.location.assign(checkout.checkoutUrl);
      } catch (error: any) {
        setPaymentError(error?.message || 'Falha ao gerar pagamento InfinitePay.');
        setProcessingPaymentLoanId(null);
      }
    },
    [initialPortalCode, initialPortalToken, loggedClient],
  );

  const globalSummary = useMemo(() => {
    let total = 0;
    let lateCount = 0;
    let maxLate = 0;
    let nextDueDate: Date | null = null;

    clientContracts.forEach((contract: any) => {
      const summary = resolveDebtSummary(contract, contract.installments);
      total += summary.totalDue;
      if (summary.hasLateInstallments) {
        lateCount += 1;
        maxLate = Math.max(maxLate, summary.maxDaysLate);
      }
      if (summary.nextDueDate) {
        const date = new Date(summary.nextDueDate);
        if (!nextDueDate || date < nextDueDate) nextDueDate = date;
      }
    });

    return { total, lateCount, maxLate, nextDueDate };
  }, [clientContracts]);

  const clientNotifications = usePortalClientNotifications(initialPortalToken, initialPortalCode, {
    overdueCount: globalSummary.lateCount,
    maxDaysLate: globalSummary.maxLate,
    nextDueDate: globalSummary.nextDueDate,
  });

  const contatoWhatsapp = useMemo(() => clientContracts[0]?.contato_whatsapp || null, [clientContracts]);

  const handleSupportAction = useCallback(() => {
    if (contatoWhatsapp) {
      const message = `Olá, sou ${loggedClient.name} e preciso de suporte com meu contrato.`;
      const cleanPhone = String(contatoWhatsapp).replace(/\D/g, '');
      window.open(
        `https://wa.me/${cleanPhone.startsWith('55') ? '' : '55'}${cleanPhone}?text=${encodeURIComponent(message)}`,
        '_blank',
      );
      return;
    }
    setIsChatOpen(true);
  }, [contatoWhatsapp, loggedClient]);

  if (isLoading) return <LoadingState />;
  if (portalError || !loggedClient) return <AccessError />;

  const nextDueLabel = globalSummary.nextDueDate
    ? formatBRDate(globalSummary.nextDueDate.toISOString().slice(0, 10))
    : 'Sem vencimentos';

  return (
    <div className="min-h-screen bg-[#020817] text-white flex justify-center relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(37,99,235,0.14),transparent_38%)]" />

      <AnimatePresence>
        {clientNotifications.length > 0 && (
          <div className="fixed top-4 left-4 right-4 z-[220] flex justify-center pointer-events-none">
            <div className="w-full max-w-md space-y-2">
              {clientNotifications.slice(0, 2).map((notification: any, index: number) => (
                <motion.div
                  key={notification.id}
                  initial={{ y: -24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -24, opacity: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`pointer-events-auto border-l-4 px-4 py-3 bg-slate-950/95 backdrop-blur-xl shadow-2xl flex items-start gap-3 ${
                    notification.type === 'WARNING' ? 'border-rose-500' : 'border-amber-400'
                  }`}
                >
                  <BellRing size={17} className={notification.type === 'WARNING' ? 'text-rose-400' : 'text-amber-300'} />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] font-black text-slate-400">
                      {notification.type === 'WARNING' ? 'Alerta importante' : 'Lembrete'}
                    </p>
                    <p className="text-[11px] text-slate-200 mt-1 leading-snug">{notification.message}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full max-w-xl min-h-screen border-x border-slate-900/80 bg-[#031022]/80">
        <header className="sticky top-0 z-40 bg-[#020817]/95 backdrop-blur-xl border-b border-slate-800/80 px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-400/30 flex items-center justify-center font-black shadow-lg shadow-blue-950/50 relative shrink-0">
              {loggedClient.name.charAt(0).toUpperCase()}
              <span className="absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#020817]" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.25em] font-black text-blue-400/80">Área do cliente</p>
              <h1 className="text-base font-black truncate">Olá, {loggedClient.name.split(' ')[0]}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => confirmPortalExit() && exitPortal()}
            className="h-10 w-10 rounded-full border border-slate-800 text-slate-500 hover:text-rose-400 hover:border-rose-500/30 flex items-center justify-center transition-colors"
            aria-label="Sair do portal"
          >
            <LogOut size={17} />
          </button>
        </header>

        <section className="border-b border-slate-800/80">
          <div className="px-4 pt-6 pb-5">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-black text-slate-500">
              <ShieldCheck size={13} className={globalSummary.lateCount > 0 ? 'text-rose-400' : 'text-emerald-400'} />
              Posição financeira
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <p className={`text-3xl font-black tracking-tight tabular-nums ${globalSummary.lateCount > 0 ? 'text-rose-400' : 'text-white'}`}>
                  {formatMoney(globalSummary.total)}
                </p>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                  {clientContracts.length} contrato{clientContracts.length === 1 ? '' : 's'} ativo{clientContracts.length === 1 ? '' : 's'}
                </p>
              </div>
              <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${globalSummary.lateCount > 0 ? 'border-rose-500/30 text-rose-400 bg-rose-500/10' : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'}`}>
                {globalSummary.lateCount > 0 ? `${globalSummary.lateCount} em atraso` : 'Situação regular'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 border-t border-slate-800/70">
            <div className="px-3 py-3 border-r border-slate-800/70">
              <p className="text-[8px] uppercase tracking-[0.16em] font-black text-slate-600">Em aberto</p>
              <p className="mt-1 text-[11px] font-black text-white tabular-nums">{formatMoney(globalSummary.total)}</p>
            </div>
            <div className="px-3 py-3 border-r border-slate-800/70">
              <p className="text-[8px] uppercase tracking-[0.16em] font-black text-slate-600">Em atraso</p>
              <p className="mt-1 text-[11px] font-black text-rose-400">{globalSummary.lateCount}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[8px] uppercase tracking-[0.16em] font-black text-slate-600">Próximo</p>
              <p className="mt-1 text-[11px] font-black text-blue-300 truncate">{nextDueLabel}</p>
            </div>
          </div>
        </section>

        <nav className="grid grid-cols-2 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => setIsLegalOpen(true)}
            className="px-4 py-3 border-r border-slate-800/80 flex items-center justify-between hover:bg-slate-900/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-black text-slate-300">
              <FileSignature size={15} className="text-indigo-400" /> Documentos
            </span>
            <ChevronRight size={14} className="text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setIsFilesOpen(true)}
            className="px-4 py-3 flex items-center justify-between hover:bg-slate-900/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-black text-slate-300">
              <FolderOpen size={15} className="text-blue-400" /> Arquivos
              {allOperatorFiles.length > 0 && (
                <span className="h-4 min-w-4 px-1 rounded-full bg-blue-600 text-[8px] flex items-center justify-center text-white">
                  {allOperatorFiles.length}
                </span>
              )}
            </span>
            <ChevronRight size={14} className="text-slate-600" />
          </button>
        </nav>

        <section>
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.24em] font-black text-slate-500">Seus contratos</h2>
            <span className="text-[9px] font-bold text-slate-600">Toque para detalhar</span>
          </div>

          {clientContracts.length === 0 ? (
            <div className="py-16 px-6 text-center border-b border-slate-800/80">
              <RefreshCw size={24} className="mx-auto text-slate-700" />
              <p className="mt-3 text-[10px] uppercase tracking-widest font-black text-slate-600">Nenhum contrato ativo</p>
            </div>
          ) : (
            clientContracts.map((contract: any) => (
              <ContractRow
                key={contract.id}
                loan={contract}
                expanded={expandedLoanId === contract.id}
                onToggle={() => setExpandedLoanId((current) => (current === contract.id ? null : contract.id))}
                onPay={() => handleInfinitePay(contract)}
                isProcessingPayment={processingPaymentLoanId === contract.id}
              />
            ))
          )}

          {paymentError && (
            <div role="alert" className="mx-4 my-3 border-l-4 border-rose-500 bg-rose-950/30 px-4 py-3 text-[10px] font-bold text-rose-200">
              {paymentError}
            </div>
          )}
        </section>

        <section className="border-t border-slate-800/80 px-4 py-5">
          <PortalEducationalAI contracts={clientContracts} clientName={loggedClient.name} />
        </section>

        {clientContracts.length > 0 && (
          <footer className="border-t border-slate-800/80 px-4 py-4 flex items-center gap-3 pb-24">
            <Building size={18} className="text-slate-600" />
            <div className="min-w-0">
              <p className="text-[8px] uppercase tracking-[0.18em] font-black text-slate-600">Instituição credora</p>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                {(clientContracts[0] as any).creditorName || 'CapitalFlow Soluções Financeiras'}
              </p>
            </div>
          </footer>
        )}
      </main>

      <button
        type="button"
        onClick={handleSupportAction}
        className="fixed bottom-6 right-5 z-[100] h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-[0_15px_35px_rgba(37,99,235,0.35)] flex items-center justify-center transition-transform active:scale-95"
        aria-label="Abrir suporte"
      >
        <MessageCircle size={24} />
      </button>

      {isChatOpen && (
        <PortalChatDrawer
          loan={clientContracts[0] || { client_id: loggedClient.id }}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      <AnimatePresence>
        {isLegalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-[#020817]/98 backdrop-blur-xl flex justify-center"
          >
            <div className="w-full max-w-xl min-h-screen border-x border-slate-800 bg-[#031022] flex flex-col">
              <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Gavel size={20} className="text-indigo-400" />
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-tight">Documentos jurídicos</h2>
                    <p className="text-[9px] text-slate-500 font-bold">Assinaturas e instrumentos</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsLegalOpen(false)} className="h-9 w-9 rounded-full border border-slate-800 text-slate-500 flex items-center justify-center">
                  <X size={17} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3 text-[10px] text-slate-400">
                  <ShieldCheck size={17} className="text-indigo-400" />
                  Documentos protegidos e vinculados ao seu contrato.
                </div>

                {loadingDocs ? (
                  <div className="py-20 flex flex-col items-center gap-3">
                    <RefreshCw className="animate-spin text-indigo-400" />
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-600">Carregando documentos</p>
                  </div>
                ) : legalDocsError ? (
                  <div className="m-4 border-l-4 border-rose-500 bg-rose-950/30 p-4">
                    <p className="text-xs text-rose-200">{legalDocsError}</p>
                    <button type="button" onClick={loadDocs} className="mt-3 text-[9px] uppercase font-black text-rose-400">Tentar novamente</button>
                  </div>
                ) : docList.length === 0 ? (
                  <div className="py-20 text-center text-slate-600 text-[10px] uppercase tracking-widest font-black">Nenhum documento disponível</div>
                ) : (
                  docList.map((doc: any) => {
                    const signed = String(doc.status_assinatura || '').toUpperCase() === 'ASSINADO';
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => openPublicLegalDocument(doc)}
                        className="w-full px-4 py-4 border-b border-slate-800 flex items-center justify-between hover:bg-slate-900/40 transition-colors text-left"
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <FileText size={19} className={signed ? 'text-emerald-400' : 'text-indigo-400'} />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-black uppercase truncate">{doc.tipo || 'Instrumento jurídico'}</span>
                            <span className="block text-[9px] text-slate-500 mt-1">Criado em {new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                          </span>
                        </span>
                        <span className={`text-[8px] uppercase tracking-wider font-black ${signed ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {signed ? 'Assinado' : 'Pendente'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFilesOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-[#020817]/98 backdrop-blur-xl flex justify-center"
          >
            <div className="w-full max-w-xl min-h-screen border-x border-slate-800 bg-[#031022] flex flex-col">
              <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderOpen size={20} className="text-blue-400" />
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-tight">Arquivos recebidos</h2>
                    <p className="text-[9px] text-slate-500 font-bold">Promissórias, recibos e anexos</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsFilesOpen(false)} className="h-9 w-9 rounded-full border border-slate-800 text-slate-500 flex items-center justify-center">
                  <X size={17} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {allOperatorFiles.length === 0 ? (
                  <div className="py-20 text-center text-slate-600 text-[10px] uppercase tracking-widest font-black">Nenhum arquivo disponível</div>
                ) : (
                  allOperatorFiles.map((file: any) => (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => openFile(file.file_url)}
                      className="w-full px-4 py-4 border-b border-slate-800 flex items-center justify-between hover:bg-slate-900/40 transition-colors text-left"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <FileText size={19} className="text-blue-400" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-black uppercase truncate">{file.file_name || file.nome_arquivo || file.type || 'Arquivo'}</span>
                          <span className="block text-[9px] text-slate-500 mt-1">Contrato #{String(file.contractId || '').slice(0, 6).toUpperCase()}</span>
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-600" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
