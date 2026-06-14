import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Brain,
  Calculator,
  CheckCircle2,
  Clipboard,
  FileSignature,
  FolderSearch,
  Gavel,
  MessageCircle,
  PhoneOff,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { Client, Loan, UserProfile } from '../types';
import { loanEngine } from '../domain/loanEngine';
import { formatDate } from '../utils/loanCalculator';
import { formatMoney, maskPhone } from '../utils/formatters';
import { getInstallmentOpenAmount, isInstallmentOpen } from '../utils/loanStatus';
import { buildWhatsAppLink } from '../utils/whatsapp';
import { LegalDocumentSummary, legalOperationsService } from '../services/legalOperations.service';

type ActionItem = {
  id: string;
  kind: 'OVERDUE' | 'DUE_SOON' | 'PROOF' | 'LEGAL_DOC' | 'SIGNATURE' | 'CONTACT' | 'LEAD';
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  loan?: Loan;
  document?: LegalDocumentSummary;
  dueDate?: string;
  days?: number;
};

interface DossierPageProps {
  loans: Loan[];
  clients: Client[];
  activeUser: UserProfile | null;
  isStealthMode?: boolean;
  onOpenLoan: (loanId: string) => void;
  onOpenLegal: (loanId: string) => void;
  onOpenSimulator: () => void;
  onRenegotiate: (loan: Loan) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const dayMs = 86400000;

const normalizeDigits = (value: string | undefined | null) => String(value || '').replace(/\D/g, '');

const getDueDate = (inst: any): string => inst?.dueDate || inst?.due_date || inst?.data_vencimento || '';

const daysFromToday = (date: string) => {
  if (!date) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T12:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / dayMs);
};

const displayDate = (date: string) => {
  if (!date) return 'sem data';
  const parsed = new Date(date.length <= 10 ? `${date}T12:00:00` : date);
  return Number.isNaN(parsed.getTime()) ? 'sem data' : formatDate(parsed);
};

const getNextOpenInstallment = (loan: Loan) => {
  const schedule = loan.activeAgreement?.installments?.length ? loan.activeAgreement.installments : loan.installments;
  return [...(schedule || [])]
    .filter((inst: any) => isInstallmentOpen(inst))
    .sort((a: any, b: any) => new Date(getDueDate(a)).getTime() - new Date(getDueDate(b)).getTime())[0];
};

const severityClass = (severity: ActionItem['severity']) => {
  switch (severity) {
    case 'CRITICAL':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
    case 'HIGH':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'MEDIUM':
      return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300';
  }
};

const actionIcon = (kind: ActionItem['kind']) => {
  switch (kind) {
    case 'OVERDUE':
      return <ShieldAlert size={16} />;
    case 'DUE_SOON':
      return <AlertTriangle size={16} />;
    case 'PROOF':
      return <BadgeCheck size={16} />;
    case 'LEGAL_DOC':
      return <FileSignature size={16} />;
    case 'SIGNATURE':
      return <Gavel size={16} />;
    case 'CONTACT':
      return <PhoneOff size={16} />;
    default:
      return <CheckCircle2 size={16} />;
  }
};

const buildBillingMessage = (loan: Loan, action?: ActionItem, tone: 'AMIGAVEL' | 'FIRME' | 'JURIDICO' = 'AMIGAVEL') => {
  const balance = loanEngine.computeRemainingBalance(loan);
  const next = getNextOpenInstallment(loan);
  const due = next ? getDueDate(next as any) : '';
  const amount = next ? getInstallmentOpenAmount(next as any) : balance.totalRemaining;
  const name = loan.debtorName?.split(' ')[0] || loan.debtorName || 'cliente';

  if (tone === 'JURIDICO') {
    return `Olá, ${name}. Consta pendência no contrato ${loan.id.slice(0, 8).toUpperCase()} no valor de ${formatMoney(amount)}${due ? `, vencida em ${displayDate(due)}` : ''}. Para evitar avanço do procedimento jurídico, regularize ou responda este contato ainda hoje.`;
  }

  if (tone === 'FIRME') {
    return `Olá, ${name}. Seu contrato ${loan.id.slice(0, 8).toUpperCase()} possui valor em aberto de ${formatMoney(amount)}${due ? ` com vencimento em ${displayDate(due)}` : ''}. Preciso de uma posição sobre o pagamento até hoje.`;
  }

  if (action?.kind === 'DUE_SOON') {
    return `Olá, ${name}. Passando para lembrar que seu vencimento de ${formatMoney(amount)} é ${due ? `em ${displayDate(due)}` : 'em breve'}. Se já tiver pago, pode me enviar o comprovante por aqui.`;
  }

  return `Olá, ${name}. Tudo bem? Identifiquei uma pendência de ${formatMoney(amount)} no seu contrato${due ? ` com vencimento em ${displayDate(due)}` : ''}. Pode me confirmar a previsão de pagamento?`;
};

export const DossierPage: React.FC<DossierPageProps> = ({
  loans,
  clients,
  activeUser,
  isStealthMode,
  onOpenLoan,
  onOpenLegal,
  onOpenSimulator,
  onRenegotiate,
  showToast,
}) => {
  const [documents, setDocuments] = useState<LegalDocumentSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [search, setSearch] = useState('');
  const [tone, setTone] = useState<'AMIGAVEL' | 'FIRME' | 'JURIDICO'>('AMIGAVEL');

  useEffect(() => {
    let active = true;
    legalOperationsService.listDocumentsForLoans(loans.map((loan) => loan.id)).then((items) => {
      if (active) setDocuments(items);
    });
    return () => {
      active = false;
    };
  }, [loans]);

  const docsByLoan = useMemo(() => {
    const map = new Map<string, LegalDocumentSummary[]>();
    documents.forEach((doc) => {
      const current = map.get(doc.loanId) || [];
      current.push(doc);
      map.set(doc.loanId, current);
    });
    return map;
  }, [documents]);

  const actions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    loans.forEach((loan) => {
      if (loan.isArchived) return;
      const status = loanEngine.computeLoanStatus(loan);
      const balance = loanEngine.computeRemainingBalance(loan);
      const next = getNextOpenInstallment(loan);
      const dueDate = next ? getDueDate(next as any) : '';
      const days = dueDate ? daysFromToday(dueDate) : 0;
      const loanDocs = docsByLoan.get(loan.id) || [];
      const latestDoc = loanDocs[0];
      const pendingProofs = (loan.paymentSignals || []).filter((signal: any) =>
        ['PENDENTE', 'PENDING', 'AGUARDANDO'].includes(String(signal.status || '').toUpperCase())
      );

      if (status === 'OVERDUE') {
        items.push({
          id: `overdue-${loan.id}`,
          kind: 'OVERDUE',
          title: `${loan.debtorName} em atraso`,
          description: `${formatMoney(balance.totalRemaining, isStealthMode)} em aberto${dueDate ? ` desde ${displayDate(dueDate)}` : ''}.`,
          severity: days < -7 ? 'CRITICAL' : 'HIGH',
          loan,
          dueDate,
          days,
        });
      } else if (next && days >= 0 && days <= 3) {
        items.push({
          id: `due-${loan.id}`,
          kind: 'DUE_SOON',
          title: `${loan.debtorName} vence ${days === 0 ? 'hoje' : `em ${days} dia(s)`}`,
          description: `${formatMoney(getInstallmentOpenAmount(next as any), isStealthMode)} previstos para ${displayDate(dueDate)}.`,
          severity: days === 0 ? 'HIGH' : 'MEDIUM',
          loan,
          dueDate,
          days,
        });
      }

      pendingProofs.forEach((signal: any) => {
        items.push({
          id: `proof-${loan.id}-${signal.id}`,
          kind: 'PROOF',
          title: `Comprovante aguardando revisão`,
          description: `${loan.debtorName} enviou sinalização de pagamento.`,
          severity: 'HIGH',
          loan,
        });
      });

      if (balance.totalRemaining > 0.05 && !latestDoc) {
        items.push({
          id: `legal-doc-${loan.id}`,
          kind: 'LEGAL_DOC',
          title: `Sem confissão de dívida`,
          description: `${loan.debtorName} tem saldo aberto e ainda não possui registro jurídico.`,
          severity: status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
          loan,
        });
      }

      if (latestDoc && latestDoc.status !== 'ASSINADO' && latestDoc.status !== 'CANCELADO') {
        items.push({
          id: `signature-${latestDoc.id}`,
          kind: 'SIGNATURE',
          title: `Documento ${latestDoc.status.replace('_', ' ').toLowerCase()}`,
          description: `${loan.debtorName} possui link jurídico para acompanhar ou reenviar.`,
          severity: latestDoc.status === 'EM_ASSINATURA' ? 'MEDIUM' : 'LOW',
          loan,
          document: latestDoc,
        });
      }

      if (!normalizeDigits(loan.debtorPhone)) {
        items.push({
          id: `contact-${loan.id}`,
          kind: 'CONTACT',
          title: `Cliente sem WhatsApp`,
          description: `${loan.debtorName} precisa de contato antes da cobrança automática.`,
          severity: 'MEDIUM',
          loan,
        });
      }
    });

    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return items.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [docsByLoan, isStealthMode, loans]);

  useEffect(() => {
    if (!selectedClientId) {
      const firstLoan = actions.find((action) => action.loan)?.loan || loans[0];
      if (firstLoan?.clientId) setSelectedClientId(firstLoan.clientId);
    }
    if (!selectedLoanId) {
      const firstLoan = actions.find((action) => action.loan)?.loan || loans[0];
      if (firstLoan?.id) setSelectedLoanId(firstLoan.id);
    }
  }, [actions, loans, selectedClientId, selectedLoanId]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.id === selectedClientId)
      || clients.find((client) => loans.some((loan) => loan.clientId === client.id && loan.id === selectedLoanId))
      || null;
  }, [clients, loans, selectedClientId, selectedLoanId]);

  const selectedLoan = useMemo(() => loans.find((loan) => loan.id === selectedLoanId) || null, [loans, selectedLoanId]);
  const selectedAction = useMemo(() => actions.find((action) => action.loan?.id === selectedLoanId), [actions, selectedLoanId]);

  const clientLoans = useMemo(() => {
    if (!selectedClient && !selectedClientId) return [];
    return loans.filter((loan) =>
      loan.clientId === selectedClientId
      || (selectedClient?.name && loan.debtorName?.trim().toLowerCase() === selectedClient.name.trim().toLowerCase())
    );
  }, [loans, selectedClient, selectedClientId]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 12);
    return clients.filter((client) =>
      [client.name, client.phone, client.document].some((value) => String(value || '').toLowerCase().includes(q))
    ).slice(0, 12);
  }, [clients, search]);

  const timeline = useMemo(() => {
    const items: Array<{ id: string; date: string; title: string; description: string; tone: string }> = [];

    clientLoans.forEach((loan) => {
      items.push({
        id: `created-${loan.id}`,
        date: loan.createdAt || loan.startDate,
        title: 'Contrato criado',
        description: `${loan.debtorName} - ${formatMoney(loan.principal, isStealthMode)}`,
        tone: 'text-blue-300',
      });

      (loan.ledger || []).forEach((entry: any) => {
        items.push({
          id: `ledger-${entry.id}`,
          date: entry.date,
          title: entry.type === 'PAYMENT' ? 'Pagamento registrado' : String(entry.type || 'Movimento'),
          description: `${formatMoney(Math.abs(Number(entry.amount || 0)), isStealthMode)} ${entry.notes ? `- ${entry.notes}` : ''}`,
          tone: entry.type === 'PAYMENT' ? 'text-emerald-300' : 'text-slate-300',
        });
      });

      (loan.installments || []).forEach((inst: any) => {
        if (!isInstallmentOpen(inst)) return;
        items.push({
          id: `inst-${inst.id}`,
          date: getDueDate(inst),
          title: daysFromToday(getDueDate(inst)) < 0 ? 'Parcela vencida' : 'Parcela aberta',
          description: `${formatMoney(getInstallmentOpenAmount(inst), isStealthMode)} em aberto.`,
          tone: daysFromToday(getDueDate(inst)) < 0 ? 'text-rose-300' : 'text-amber-300',
        });
      });

      (docsByLoan.get(loan.id) || []).forEach((doc) => {
        items.push({
          id: `doc-${doc.id}`,
          date: doc.createdAt,
          title: `Documento jurídico ${doc.status.replace('_', ' ').toLowerCase()}`,
          description: `${doc.type} - ${doc.token ? 'link disponível' : 'sem token'}.`,
          tone: doc.status === 'ASSINADO' ? 'text-emerald-300' : 'text-indigo-300',
        });
      });
    });

    return items
      .filter((item) => item.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [clientLoans, docsByLoan, isStealthMode]);

  const selectedMessage = selectedLoan ? buildBillingMessage(selectedLoan, selectedAction, tone) : '';

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copiado.`, 'success');
  };

  const openWhatsApp = (loan: Loan, message: string) => {
    const phone = normalizeDigits(loan.debtorPhone);
    if (!phone) {
      showToast('Cliente sem WhatsApp cadastrado.', 'warning');
      return;
    }
    window.open(buildWhatsAppLink(phone, message), '_blank');
  };

  const balance = selectedLoan ? loanEngine.computeRemainingBalance(selectedLoan) : null;
  const agreementScenarios = selectedLoan && balance ? [
    { label: 'Recuperação rápida', discount: 0.1, down: 0.2, installments: 3 },
    { label: 'Equilibrado', discount: 0.05, down: 0.1, installments: 6 },
    { label: 'Fôlego ao cliente', discount: 0, down: 0, installments: 10 },
  ].map((scenario) => {
    const negotiated = Math.max(0, balance.totalRemaining * (1 - scenario.discount));
    const entry = negotiated * scenario.down;
    const financed = Math.max(0, negotiated - entry);
    return {
      ...scenario,
      negotiated,
      entry,
      installmentValue: financed / scenario.installments,
    };
  }) : [];

  const docsSigned = documents.filter((doc) => doc.status === 'ASSINADO').length;
  const docsPending = documents.filter((doc) => doc.status !== 'ASSINADO' && doc.status !== 'CANCELADO').length;
  const criticalActions = actions.filter((action) => action.severity === 'CRITICAL' || action.severity === 'HIGH').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300">
            <FolderSearch size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-wider leading-none">Dossiê</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Mesa de ações, cobrança e histórico do cliente</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={onOpenSimulator} className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <Calculator size={14} /> Simulador
          </button>
          {selectedLoan && (
            <button onClick={() => onOpenLegal(selectedLoan.id)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Scale size={14} /> Jurídico
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Ações críticas</p>
          <p className="text-2xl font-black text-white mt-1">{criticalActions}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Registros jurídicos</p>
          <p className="text-2xl font-black text-white mt-1">{documents.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Assinados</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">{docsSigned}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Em assinatura</p>
          <p className="text-2xl font-black text-amber-300 mt-1">{docsPending}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="xl:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Clipboard size={16} className="text-blue-400" /> Mesa de Ações
            </h2>
            <span className="text-[9px] font-black text-slate-500 uppercase">{actions.length} itens</span>
          </div>

          <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {actions.length === 0 ? (
              <div className="p-6 rounded-lg border border-slate-800 bg-slate-900 text-center">
                <CheckCircle2 className="mx-auto text-emerald-400 mb-3" size={24} />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nada urgente agora</p>
              </div>
            ) : actions.slice(0, 24).map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  if (action.loan) {
                    setSelectedLoanId(action.loan.id);
                    setSelectedClientId(action.loan.clientId);
                  }
                }}
                className={`w-full text-left rounded-lg border p-3 transition-all hover:border-blue-500/60 ${severityClass(action.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{actionIcon(action.kind)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-widest text-white">{action.title}</p>
                    <p className="text-[10px] leading-relaxed mt-1 opacity-80">{action.description}</p>
                    {action.loan && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="px-2 py-1 rounded bg-slate-950/50 text-[8px] font-black uppercase tracking-widest">
                          {maskPhone(action.loan.debtorPhone, isStealthMode)}
                        </span>
                        <span className="px-2 py-1 rounded bg-slate-950/50 text-[8px] font-black uppercase tracking-widest">
                          abrir dossiê
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="xl:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente no dossiê..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedClientId(client.id);
                    const firstLoan = loans.find((loan) => loan.clientId === client.id);
                    if (firstLoan) setSelectedLoanId(firstLoan.id);
                  }}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${
                    selectedClientId === client.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {client.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Dossiê do Cliente</p>
                <h2 className="text-lg font-black text-white uppercase mt-1">{selectedClient?.name || selectedLoan?.debtorName || 'Selecione um cliente'}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedClient?.phone ? maskPhone(selectedClient.phone, isStealthMode) : selectedLoan?.debtorPhone ? maskPhone(selectedLoan.debtorPhone, isStealthMode) : 'Sem telefone'}
                </p>
              </div>
              <UserRound className="text-slate-600" size={28} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                <p className="text-[8px] font-black uppercase text-slate-500">Contratos</p>
                <p className="text-xl font-black text-white">{clientLoans.length}</p>
              </div>
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                <p className="text-[8px] font-black uppercase text-slate-500">Saldo aberto</p>
                <p className="text-sm font-black text-white">
                  {formatMoney(clientLoans.reduce((sum, loan) => sum + loanEngine.computeRemainingBalance(loan).totalRemaining, 0), isStealthMode)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                <p className="text-[8px] font-black uppercase text-slate-500">Docs</p>
                <p className="text-xl font-black text-white">
                  {clientLoans.reduce((sum, loan) => sum + (docsByLoan.get(loan.id)?.length || 0), 0)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {clientLoans.map((loan) => {
                const open = loanEngine.computeRemainingBalance(loan).totalRemaining;
                const latestDoc = docsByLoan.get(loan.id)?.[0];
                return (
                  <button
                    key={loan.id}
                    onClick={() => setSelectedLoanId(loan.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selectedLoanId === loan.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-white">{loan.id.slice(0, 8)} - {loan.debtorName}</p>
                        <p className="text-[9px] text-slate-500 mt-1">Aberto: {formatMoney(open, isStealthMode)}</p>
                      </div>
                      <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[8px] font-black uppercase text-slate-400">
                        {latestDoc?.status?.replace('_', ' ') || 'sem doc'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Linha do tempo</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {timeline.length === 0 ? (
                  <p className="text-xs text-slate-500">Sem eventos suficientes para este cliente.</p>
                ) : timeline.map((item) => (
                  <div key={item.id} className="border-l border-slate-800 pl-3 py-1">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${item.tone}`}>{item.title}</p>
                    <p className="text-[9px] text-slate-500">{displayDate(item.date)} - {item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="xl:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Brain size={16} className="text-blue-400" /> Assistente
            </h2>
            {selectedLoan ? (
              <>
                <div className="flex gap-2">
                  {(['AMIGAVEL', 'FIRME', 'JURIDICO'] as const).map((item) => (
                    <button
                      key={item}
                      onClick={() => setTone(item)}
                      className={`flex-1 px-2 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        tone === item ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {item.toLowerCase()}
                    </button>
                  ))}
                </div>
                <textarea
                  readOnly
                  value={selectedMessage}
                  className="w-full min-h-40 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 leading-relaxed outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => copyText(selectedMessage, 'Mensagem')} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-[9px] font-black uppercase flex items-center justify-center gap-2">
                    <Clipboard size={12} /> Copiar
                  </button>
                  <button onClick={() => openWhatsApp(selectedLoan, selectedMessage)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase flex items-center justify-center gap-2">
                    <MessageCircle size={12} /> WhatsApp
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Selecione uma ação ou contrato para gerar mensagem.</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Gavel size={16} className="text-indigo-400" /> Jurídico Acionável
            </h2>
            {selectedLoan ? (
              <>
                {(docsByLoan.get(selectedLoan.id) || []).slice(0, 3).map((doc) => (
                  <div key={doc.id} className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                    <p className="text-[10px] font-black uppercase text-white">{doc.type}</p>
                    <p className="text-[9px] text-slate-500 mt-1">{doc.status.replace('_', ' ')} - {displayDate(doc.createdAt)}</p>
                    {doc.token && (
                      <button onClick={() => copyText(`${window.location.origin}/?legal_sign=${doc.token}&role=DEBTOR`, 'Link jurídico')} className="mt-3 text-[8px] font-black uppercase text-indigo-300">
                        copiar link do cliente
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => onOpenLegal(selectedLoan.id)} className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase flex items-center justify-center gap-2">
                  abrir confissão <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">Selecione contrato para ver documentos.</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <RefreshCw size={16} className="text-amber-400" /> Régua
            </h2>
            {[
              ['D-2', 'Lembrete amigável'],
              ['D0', 'Aviso de vencimento'],
              ['D+1', 'Cobrança leve'],
              ['D+3', 'Cobrança firme'],
              ['D+7', 'Preparar jurídico'],
              ['D+15', 'Confissão/notificação'],
            ].map(([day, label]) => (
              <div key={day} className="flex items-center justify-between rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
                <span className="text-[10px] font-black text-white">{day}</span>
                <span className="text-[9px] font-bold text-slate-500 uppercase">{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Calculator size={16} className="text-cyan-400" /> Acordo
            </h2>
            {agreementScenarios.length === 0 ? (
              <p className="text-xs text-slate-500">Selecione contrato com saldo aberto.</p>
            ) : agreementScenarios.map((scenario) => (
              <div key={scenario.label} className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                <p className="text-[10px] font-black uppercase text-white">{scenario.label}</p>
                <p className="text-[9px] text-slate-500 mt-1">
                  Entrada {formatMoney(scenario.entry, isStealthMode)} + {scenario.installments}x {formatMoney(scenario.installmentValue, isStealthMode)}
                </p>
              </div>
            ))}
            {selectedLoan && (
              <button onClick={() => onRenegotiate(selectedLoan)} className="w-full px-3 py-2 rounded-lg bg-amber-600 text-white text-[9px] font-black uppercase">
                transformar em renegociação
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
