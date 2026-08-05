import React from 'react';
import { Plus, Search, Edit, Trash2, CheckSquare, Square, XCircle, MapPin, Phone, Users, ShieldAlert, Link2, Copy, Check, X, FileSearch, FileSignature, Send, ExternalLink, Loader2 } from 'lucide-react';
import { Client, Loan, UserProfile } from '../types';
import { startDictation } from '../utils/speech';
import { formatMoney, formatShortName, maskPhone, maskDocument } from '../utils/formatters';
import { parseDateOnlyUTC, todayDateOnlyUTC } from '../utils/dateHelpers';
import { clientHasCapitalOnlyRecovery } from '../utils/capitalOnlyRecovery';
import { loanEngine } from '../domain/loanEngine';
import { clientRegistrationService } from '../services/clientRegistration.service';
import { clientPreContractService } from '../services/clientPreContract.service';

interface ClientsPageProps {
  profileId: string;
  filteredClients: Client[];
  loans: Loan[];
  clientSearchTerm: string;
  setClientSearchTerm: (term: string) => void;
  openClientModal: (client?: Client) => void;
  openConfirmation: (config: any) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  // Bulk actions props
  isBulkDeleteMode: boolean;
  toggleBulkDeleteMode: () => void;
  selectedClientsToDelete: string[];
  toggleClientSelection: (id: string) => void;
  executeBulkDelete: () => void;
  onDeleteClient: (id: string) => void;
  goBack?: () => void;
  onRefresh: () => Promise<void>;
  activeUser: UserProfile | null;
}

export const ClientsPage: React.FC<ClientsPageProps & { isStealthMode?: boolean }> = ({
  profileId, filteredClients, loans, clientSearchTerm, setClientSearchTerm,
  openClientModal, openConfirmation, showToast,
  isBulkDeleteMode, toggleBulkDeleteMode, selectedClientsToDelete, toggleClientSelection, executeBulkDelete,
  onDeleteClient,
  goBack,
  isStealthMode,
  onRefresh,
  activeUser
}) => {
  const today = todayDateOnlyUTC();
  const [registrationLink, setRegistrationLink] = React.useState('');
  const [creatingLink, setCreatingLink] = React.useState(false);
  const [reviewingClientId, setReviewingClientId] = React.useState<string | null>(null);

  const [preContractClient, setPreContractClient] = React.useState<Client | null>(null);
  const [preContractForm, setPreContractForm] = React.useState({ amount: '', dueDate: '', notes: '' });
  const [preContractBusy, setPreContractBusy] = React.useState(false);
  const [preContractResult, setPreContractResult] = React.useState<{ portalUrl: string; signUrl: string } | null>(null);

  const [documentClient, setDocumentClient] = React.useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [registrationDocuments, setRegistrationDocuments] = React.useState<Awaited<ReturnType<typeof clientRegistrationService.getDocumentUrls>>>([]);
  const [loadingDocuments, setLoadingDocuments] = React.useState(false);

  const reviewRegistration = async (client: Client, status: 'APPROVED' | 'REJECTED') => {
    if (status === 'REJECTED' && !window.confirm(`Negar o cadastro de ${client.name}? Ele sairá da carteira de clientes.`)) return;
    setReviewingClientId(client.id);
    try {
      await clientRegistrationService.review(client.id, status);
      showToast(status === 'APPROVED' ? 'Cliente aprovado.' : 'Cadastro negado e removido da carteira.', 'success');
      await onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao concluir análise.', 'error');
    } finally {
      setReviewingClientId(null);
    }
  };

  const copyRegistrationLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link de inscrição copiado.', 'success');
    } catch {
      showToast('Link criado. Copie-o no campo exibido.', 'info');
    }
  };

  const createRegistrationLink = async () => {
    setCreatingLink(true);
    try {
      const result = await clientRegistrationService.createLink(profileId);
      setRegistrationLink(result.url);
      await copyRegistrationLink(result.url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao criar link.', 'error');
    } finally { setCreatingLink(false); }
  };

  const openRegistrationDocuments = async (client: Client) => {
    setDocumentClient(client);
    setLoadingDocuments(true);
    try {
      const documents = await clientRegistrationService.getDocumentUrls(client.id);
      setRegistrationDocuments(documents);
      if (!documents.length) showToast('Esta inscrição não possui documentos.', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao abrir documentos.', 'error');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const openPreContractModal = (client: Client) => {
    setPreContractClient(client);
    setPreContractForm({ amount: '', dueDate: '', notes: '' });
    setPreContractResult(null);
  };

  const createPreContract = async () => {
    if (!preContractClient || !activeUser) return;
    setPreContractBusy(true);
    try {
      const amount = Number(preContractForm.amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Valor inválido.');

      const result = await clientPreContractService.createAndSend(preContractClient, activeUser, {
        amount,
        dueDate: preContractForm.dueDate || undefined,
        notes: preContractForm.notes || undefined,
      });

      setPreContractResult({ portalUrl: result.portalUrl, signUrl: result.signUrl });
      showToast('Pré-contrato criado com sucesso.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao criar pré-contrato.', 'error');
    } finally {
      setPreContractBusy(false);
    }
  };

  const getLoanOpenAmount = (loan: Loan) => {
    const loanStatus = String((loan as any).status || '').toUpperCase();
    if (['PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'].includes(loanStatus)) return 0;

    const engineTotal = loanEngine.computeRemainingBalance(loan).totalRemaining;
    if (engineTotal > 0.5) return engineTotal;

    const hasInstallments = (loan.installments || []).length > 0;
    const installmentTotal = (loan.installments || []).reduce((total, inst: any) => {
      const status = String(inst?.status || '').toUpperCase();
      if (['PAID', 'PAGO', 'QUITADO', 'CANCELADO', 'RENEGOCIADO'].includes(status)) return total;

      return total +
        Number(inst?.principalRemaining || 0) +
        Number(inst?.interestRemaining || 0) +
        Number(inst?.lateFeeAccrued || 0);
    }, 0);

    return installmentTotal > 0.5
      ? installmentTotal
      : hasInstallments
        ? 0
      : Number((loan as any).totalDebt || (loan as any).currentDebt || loan.totalToReceive || loan.principal || 0);
  };

  const getNextOpenDueDate = (loan: Loan) => {
    const next = (loan.installments || []).find((inst: any) => {
      const status = String(inst?.status || '').toUpperCase();
      if (['PAID', 'PAGO', 'QUITADO', 'CANCELADO', 'RENEGOCIADO'].includes(status)) return false;

      const open =
        Number(inst?.principalRemaining || 0) +
        Number(inst?.interestRemaining || 0) +
        Number(inst?.lateFeeAccrued || 0);

      return open > 0.5;
    });

    return (next as any)?.dueDate ? parseDateOnlyUTC((next as any).dueDate) : null;
  };

  const getClientContractIndicators = (client: Client) => loans
    .filter((loan) => loan.clientId === client.id && !loan.isArchived)
    .map((loan) => ({ loan, amount: getLoanOpenAmount(loan) }))
    .filter(({ amount }) => amount > 0.5)
    .map(({ loan, amount }, index) => {
      const due = getNextOpenDueDate(loan);
      const diffDays = due ? Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const status = due && due.getTime() < today.getTime()
        ? 'OVERDUE'
        : diffDays !== null && diffDays >= 0 && diffDays <= 3
          ? 'DUE_SOON'
          : 'OK';

      const colorClass = status === 'OVERDUE'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : status === 'DUE_SOON'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          : 'border-blue-500/40 bg-blue-500/10 text-blue-300';

      return {
        id: loan.id,
        label: `${index + 1}. ${formatMoney(amount, isStealthMode)}`,
        colorClass,
      };
    });

  return (
    <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20">
                        <Users size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Carteira de <span className="text-blue-500">Clientes</span></h1>
                        <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Gestão de Base Ativa</p>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
                <button type="button" onClick={createRegistrationLink} disabled={creatingLink} className="px-4 py-2 bg-slate-800 border border-slate-700 text-blue-300 rounded-lg text-[10px] font-black uppercase hover:border-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50" title="Criar link público de inscrição">
                    <Link2 size={16}/> Inscrição
                </button>
                {isBulkDeleteMode ? (
                    <div className="flex gap-2 w-full md:w-auto animate-in fade-in slide-in-from-right">
                        <button onClick={executeBulkDelete} disabled={selectedClientsToDelete.length === 0} className="flex-1 md:flex-none px-4 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-rose-500 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                            <Trash2 size={16}/> Confirmar ({selectedClientsToDelete.length})
                        </button>
                        <button onClick={toggleBulkDeleteMode} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
                            <XCircle size={16}/> Cancelar
                        </button>
                    </div>
                ) : (
                    <>
                        <button onClick={toggleBulkDeleteMode} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 border border-slate-700 text-rose-400 rounded-lg text-[10px] font-black uppercase hover:bg-rose-900/20 hover:border-rose-500 transition-all flex items-center justify-center gap-2">
                            <Trash2 size={16}/> Excluir Vários
                        </button>
                        <button onClick={() => openClientModal()} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                            <Plus size={16}/> Novo Cliente
                        </button>
                    </>
                )}
            </div>
        </div>

        {registrationLink && <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-2"><input readOnly value={registrationLink} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-blue-100 outline-none"/><button type="button" className="p-2 text-blue-300" title="Copiar link" onClick={() => void copyRegistrationLink(registrationLink)}><Copy size={16}/></button></div>}

        <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg flex items-center gap-2">
            <Search className="text-slate-500 ml-2 shrink-0" size={18}/>
            <input type="text" placeholder="Buscar cliente..." className="bg-transparent w-full p-2 text-white outline-none text-sm" value={clientSearchTerm} onChange={e => setClientSearchTerm(e.target.value)} />
            <button onClick={() => startDictation(setClientSearchTerm, (msg) => showToast(msg, 'error'))} className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 hover:text-white hover:border-slate-600 transition-colors text-xs font-black uppercase shrink-0" title="Buscar por voz" type="button">🎙</button>
        </div>

        {/* GRID COMPACTA E MODERNA */}
        <div className="grid grid-cols-1 items-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredClients.filter((client) => client.registration_status !== 'REJECTED').sort((a, b) => a.name.localeCompare(b.name)).map(client => {
                const contractIndicators = getClientContractIndicators(client);

                return (
                <div
                    key={client.id}
                    className={`min-h-[220px] h-full self-start overflow-hidden bg-slate-900 border p-4 rounded-lg transition-all group relative flex flex-col ${clientHasCapitalOnlyRecovery(loans, client) ? 'border-rose-600/70 bg-rose-950/10' : isBulkDeleteMode ? 'cursor-pointer border-slate-700 hover:border-blue-500' : 'border-slate-800 hover:border-blue-500/50 hover:shadow-lg'} ${isBulkDeleteMode && selectedClientsToDelete.includes(client.id) ? 'bg-blue-900/10 border-blue-500' : ''}`}
                    onClick={isBulkDeleteMode ? () => toggleClientSelection(client.id) : () => setSelectedClient(client)}
                >
                    {isBulkDeleteMode && (
                        <div className="absolute top-3 right-3 text-blue-500 z-10">
                            {selectedClientsToDelete.includes(client.id) ? <CheckSquare size={20} className="fill-blue-500/20"/> : <Square size={20} className="text-slate-500"/>}
                        </div>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                        {client.fotoUrl ? (
                            <img src={client.fotoUrl} className="w-10 h-10 rounded-full object-cover border border-slate-700" alt={client.name}/>
                        ) : (
                            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-black text-sm group-hover:text-blue-500 transition-colors border border-slate-700 shrink-0">
                                {client.name.charAt(0)}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-white text-sm truncate uppercase">{formatShortName(client.name)}</h3>
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] text-slate-500 truncate font-mono">{maskDocument((client as any).document, isStealthMode) || 'S/ CPF'}</p>
                                {clientHasCapitalOnlyRecovery(loans, client) && (
                                    <span className="inline-flex items-center gap-1 text-[8px] text-rose-500 font-black uppercase">
                                        <ShieldAlert size={10}/> Somente Capital
                                    </span>
                                )}
                                {client.createdAt && (
                                    <span className="text-[8px] text-slate-600 font-medium uppercase tracking-tighter">
                                        • {new Date(client.createdAt).toLocaleDateString('pt-BR')}
                                    </span>
                                )}
                            </div>
                        </div>
                        {client.registration_status === 'PENDING_REVIEW' && <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[8px] font-black uppercase text-amber-300">Em análise{client.cpf_in_identity ? ' · CPF no RG' : ''}</span>}
                        {!isBulkDeleteMode && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => openPreContractModal(client)} className="p-2 text-indigo-400/80 hover:text-indigo-300 bg-slate-950 rounded-lg hover:bg-indigo-950/40 transition-colors" title="Enviar documento para assinatura">
                                    <FileSignature size={14}/>
                                </button>
                                {(client.registration_document_count || 0) > 0 && (
                                  <button type="button" onClick={() => void openRegistrationDocuments(client)} className="p-2 text-blue-400 hover:text-blue-300 bg-slate-950 rounded-lg hover:bg-blue-950/30 transition-colors" title={`Ver documentos do cadastro (${client.registration_document_count})`}>
                                      <FileSearch size={14}/>
                                  </button>
                                )}
                                <button onClick={() => openClientModal(client)} className="p-2 text-slate-500 hover:text-white bg-slate-950 rounded-lg hover:bg-slate-800 transition-colors" title="Editar">
                                    <Edit size={14}/>
                                </button>
                                <button onClick={() => onDeleteClient(client.id)} className="p-2 text-rose-500/70 hover:text-rose-500 bg-slate-950 rounded-lg hover:bg-rose-950/30 transition-colors" title="Excluir">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        )}
                    </div>

                    {client.registration_status === 'PENDING_REVIEW' && (
                      <div className="mb-3 grid grid-cols-3 gap-1.5" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => void openRegistrationDocuments(client)} className="flex h-8 items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-950 text-[8px] font-black uppercase text-slate-300" title="Ver documentos"><FileSearch size={12}/> Docs ({client.registration_document_count || 0})</button>
                        <button type="button" disabled={reviewingClientId === client.id} onClick={() => void reviewRegistration(client, 'APPROVED')} className="flex h-8 items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-[8px] font-black uppercase text-emerald-300 disabled:opacity-50"><Check size={12}/> Aprovar</button>
                        <button type="button" disabled={reviewingClientId === client.id} onClick={() => void reviewRegistration(client, 'REJECTED')} className="flex h-8 items-center justify-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 text-[8px] font-black uppercase text-rose-300 disabled:opacity-50"><X size={12}/> Negar</button>
                      </div>
                    )}

                    {contractIndicators.length > 0 && (
                        <div className="mb-3 flex items-center gap-1.5 overflow-hidden">
                            {contractIndicators.slice(0, 3).map((item) => (
                                <span
                                    key={item.id}
                                    className={`min-w-0 truncate rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase ${item.colorClass}`}
                                    title={item.label}
                                >
                                    {item.label}
                                </span>
                            ))}
                            {contractIndicators.length > 3 && (
                                <span className="rounded-md border border-slate-700 bg-slate-950/60 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-400">
                                    +{contractIndicators.length - 3}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5 mt-auto" onClick={(e) => e.stopPropagation()}>
                        <a
                            href={client.phone ? `https://wa.me/55${client.phone.replace(/\D/g, '')}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-[10px] text-slate-300 bg-slate-950/50 p-2 rounded-lg hover:bg-emerald-950/30 hover:text-emerald-300 transition-colors"
                        >
                            <Phone size={12} className="text-emerald-500 shrink-0"/>
                            <span className="truncate">{maskPhone(client.phone, isStealthMode)}</span>
                        </a>
                        {client.email && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-lg">
                                <Users size={12} className="text-purple-500 shrink-0"/>
                                <span className="truncate">{client.email}</span>
                            </div>
                        )}
                        {(client as any).address && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-lg">
                                <MapPin size={12} className="text-emerald-500 shrink-0"/>
                                <span className="truncate">{(client as any).address}</span>
                            </div>
                        )}
                    </div>
                </div>
                );
            })}
        </div>

        {preContractClient && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-indigo-500/30 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Pré-contrato digital</p>
                  <h2 className="mt-1 text-base font-black uppercase text-white">{formatShortName(preContractClient.name)}</h2>
                  <p className="mt-1 text-xs text-slate-500">O documento será enviado para o link público do cliente antes de lançar o contrato.</p>
                </div>
                <button type="button" onClick={() => setPreContractClient(null)} className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:text-white">
                  <X size={16}/>
                </button>
              </div>

              {!preContractResult ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Valor do capital</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={preContractForm.amount}
                      onChange={(event) => setPreContractForm((current) => ({ ...current, amount: event.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500"
                      placeholder="Ex: 1200,00"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Vencimento</span>
                    <input
                      type="date"
                      value={preContractForm.dueDate}
                      onChange={(event) => setPreContractForm((current) => ({ ...current, dueDate: event.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Observação interna</span>
                    <textarea
                      value={preContractForm.notes}
                      onChange={(event) => setPreContractForm((current) => ({ ...current, notes: event.target.value }))}
                      className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-indigo-500"
                      placeholder="Opcional"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={preContractBusy || !preContractForm.amount}
                    onClick={() => void createPreContract()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {preContractBusy ? <Loader2 className="animate-spin" size={15}/> : <Send size={15}/>}
                    Enviar para assinatura
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    Documento criado. Envie o link do cliente; ele verá a área de documentos e poderá assinar.
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">Link do cliente</span>
                    <input readOnly value={preContractResult.portalUrl} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-xs text-blue-200 outline-none"/>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void navigator.clipboard.writeText(preContractResult.portalUrl)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Copiar portal</button>
                    <button type="button" onClick={() => window.open(preContractResult.signUrl, '_blank', 'noopener,noreferrer')} className="rounded-lg bg-indigo-600 px-3 py-2 text-[9px] font-black uppercase text-white">Abrir assinatura</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedClient && (
          <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="client-record-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedClient(null); }}>
            <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
              <header className="flex items-center gap-3 border-b border-slate-800 p-4">
                {selectedClient.fotoUrl ? <img src={selectedClient.fotoUrl} className="h-14 w-14 shrink-0 rounded-full border border-slate-700 object-cover" alt={selectedClient.name}/> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-800 text-lg font-black text-blue-400">{selectedClient.name.charAt(0)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">Ficha do cliente</p>
                  <h2 id="client-record-title" className="truncate text-lg font-black uppercase text-white">{selectedClient.name}</h2>
                  <p className="text-[10px] text-slate-500">Cadastro desde {selectedClient.createdAt ? new Date(selectedClient.createdAt).toLocaleDateString('pt-BR') : 'data não informada'}</p>
                </div>
                <button type="button" onClick={() => setSelectedClient(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar ficha"><X size={18}/></button>
              </header>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase text-slate-500">CPF</p><p className="mt-1 text-sm font-semibold text-slate-100">{maskDocument(selectedClient.document, isStealthMode) || 'Não informado'}</p></div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase text-slate-500">WhatsApp</p><p className="mt-1 text-sm font-semibold text-slate-100">{maskPhone(selectedClient.phone, isStealthMode) || 'Não informado'}</p></div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 sm:col-span-2"><p className="text-[9px] font-black uppercase text-slate-500">E-mail</p><p className="mt-1 break-words text-sm font-semibold text-slate-100">{selectedClient.email || 'Não informado'}</p></div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 sm:col-span-2"><p className="text-[9px] font-black uppercase text-slate-500">Endereço</p><p className="mt-1 text-sm font-semibold text-slate-100">{[selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean).join(' - ') || 'Não informado'}</p></div>
                  {selectedClient.notes && <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 sm:col-span-2"><p className="text-[9px] font-black uppercase text-slate-500">Observações</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{selectedClient.notes}</p></div>}
                </div>
              </div>
              <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-800 p-4">
                {(selectedClient.registration_document_count || 0) > 0 && <button type="button" onClick={() => void openRegistrationDocuments(selectedClient)} className="flex h-10 items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 text-xs font-black uppercase text-blue-300"><FileSearch size={15}/> Documentos ({selectedClient.registration_document_count})</button>}
                <button type="button" onClick={() => { const client = selectedClient; setSelectedClient(null); openClientModal(client); }} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-black uppercase text-white hover:bg-blue-500"><Edit size={15}/> Editar cadastro</button>
              </footer>
            </div>
          </div>
        )}

        {documentClient && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="registration-documents-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentClient(null); }}>
            <div className="flex max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <div className="min-w-0">
                  <h2 id="registration-documents-title" className="truncate text-sm font-black uppercase text-white">Documentos de {documentClient.name}</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">Arquivos enviados no cadastro</p>
                </div>
                <button type="button" onClick={() => setDocumentClient(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar documentos"><X size={18}/></button>
              </div>
              <div className="min-h-32 flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loadingDocuments ? (
                  <div className="grid min-h-28 place-items-center text-slate-400"><Loader2 className="animate-spin" size={24}/></div>
                ) : registrationDocuments.length === 0 ? (
                  <div className="grid min-h-28 place-items-center text-center text-xs text-slate-500">Nenhum documento foi encontrado para este cadastro.</div>
                ) : (
                  <div className="space-y-2">
                    {registrationDocuments.map((document) => (
                      <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 hover:border-blue-500/50">
                        <FileSearch size={18} className="shrink-0 text-blue-400"/>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-100">{document.name}</p>
                          <p className="mt-0.5 text-[9px] font-black uppercase text-slate-500">{String(document.type).replaceAll('_', ' ')}</p>
                        </div>
                        <ExternalLink size={15} className="shrink-0 text-slate-500"/>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
};
