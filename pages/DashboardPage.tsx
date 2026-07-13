
import React, { useMemo } from 'react';
import { BarChart3, Banknote, CheckCircle2, Briefcase, PieChart as PieIcon, TrendingUp, Users, Calendar, Percent, RefreshCw, ShieldAlert, Skull } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Loan, CapitalSource, LedgerEntry, Agreement, AgreementInstallment, SortOption, UserProfile, Installment } from '../types';
import { LoanCard } from '../components/cards/LoanCard';
import { ClientGroupCard } from '../components/cards/ClientGroupCard';
import { StatCard } from '../components/StatCard';
import { ProfitCard } from '../components/cards/ProfitCard';
import { DashboardAlerts } from '../features/dashboard/DashboardAlerts';
import { DashboardControls } from '../components/dashboard/DashboardControls';
import { AIBalanceInsight } from '../features/dashboard/AIBalanceInsight';
import { formatMoney } from '../utils/formatters';
import { groupLoansByClient } from '../domain/dashboard/loanGrouping';

const ContractCardSkeleton: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="cf-contract-card-enter mb-4 break-inside-avoid rounded-lg border border-slate-800 bg-slate-900 p-3"
    style={{ animationDelay: `${index * 45}ms` }}
  >
    <div className="flex min-h-[7.25rem] flex-col justify-between gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-slate-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 max-w-full animate-pulse rounded bg-slate-800" />
            <div className="flex gap-1.5">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-800/80" />
              <div className="h-4 w-12 animate-pulse rounded bg-slate-800/80" />
            </div>
          </div>
        </div>
        <div className="h-5 w-14 animate-pulse rounded-md bg-slate-800" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-slate-800/30 pt-2">
        <div className="space-y-1.5">
          <div className="h-2 w-16 animate-pulse rounded bg-slate-800" />
          <div className="h-2 w-24 animate-pulse rounded bg-slate-800/80" />
        </div>
        <div className="h-5 w-24 animate-pulse rounded bg-slate-800" />
      </div>
    </div>
  </div>
);

const ContractCardsSkeleton: React.FC = () => (
  <div className="columns-1 xl:columns-2 2xl:columns-3 gap-4" aria-label="Carregando contratos">
    {Array.from({ length: 9 }).map((_, index) => (
      <ContractCardSkeleton key={index} index={index} />
    ))}
  </div>
);

interface DashboardPageProps {
  loans: Loan[];
  sources: CapitalSource[];
  filteredLoans: Loan[];
  stats: any;
  activeUser: UserProfile | null;
  staffMembers: UserProfile[];
  selectedStaffId: string;
  onStaffChange: (id: string) => void;
  mobileDashboardTab: 'CONTRACTS' | 'BALANCE';
  setMobileDashboardTab: (val: 'CONTRACTS' | 'BALANCE') => void;
  statusFilter: 'TODOS' | 'ATRASADOS' | 'EM_DIA' | 'PAGOS' | 'ARQUIVADOS' | 'ATRASO_CRITICO';
  setStatusFilter: (val: any) => void;
  sortOption: SortOption;
  setSortOption: (val: SortOption) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedLoanId: string | null;
  setSelectedLoanId: (val: string | null) => void;
  onEdit: (loan: Loan) => void;
  onMessage: (loan: Loan) => void;
  onArchive: (loan: Loan) => void;
  onRestore: (loan: Loan) => void;
  onDelete: (loan: Loan) => void;
  onActivate: (loan: Loan) => void;
  onNote: (loan: Loan) => void;
  onPortalLink: (loan: Loan) => void;
  onUploadPromissoria: (loan: Loan) => void;
  onUploadDoc: (loan: Loan) => void;
  onViewPromissoria: (url: string) => void;
  onViewDoc: (url: string) => void;
  onReviewSignal: (id: string, status: 'APROVADO' | 'NEGADO') => void;
  onOpenComprovante: (url: string) => void;
  onReverseTransaction: (transaction: LedgerEntry, loan: Loan) => void;
  onOpenReceipt?: (transaction: LedgerEntry, loan: Loan) => void;
  setWithdrawModal: (open: boolean) => void;
  showToast: (msg: string, type?: 'error'|'success') => void;
  isStealthMode: boolean;
  onRenegotiate: (loan: Loan | Loan[]) => void;
  onNewAporte: (loan: Loan) => void;
  onMarkAsBilled: (loan: Loan) => void;
  onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment, amount?: number, forgiveLateFee?: boolean) => void;
  onReverseAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => void;
  onInstallmentPayment?: (loan: Loan, inst: Installment, debt: any, amount?: number, options?: { forgivenessMode?: 'NONE' | 'FINE_ONLY' | 'MORA_ONLY' | 'FINE_AND_MORA' | 'TOTAL_CHARGES' | 'CAPITAL_ONLY' | 'INTEREST_ONLY' | 'BOTH' }) => void;
  onReverseInstallmentPayment?: (loan: Loan, inst: Installment) => void;
  onNavigate: (path: string) => void;
  onOpenClient?: (clientId: string | null | undefined, clientName: string) => void;
  onRefresh: () => void;
  ui: any;
  loanCtrl: any;
  isLoadingData?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  loans, sources, filteredLoans, stats, activeUser, staffMembers, selectedStaffId, onStaffChange,
  mobileDashboardTab, setMobileDashboardTab, statusFilter, setStatusFilter, sortOption, setSortOption,
  searchTerm, setSearchTerm, selectedLoanId, setSelectedLoanId, onEdit, onMessage, onArchive, onRestore,
  onDelete, onActivate, onNote, onPortalLink, onUploadPromissoria, onUploadDoc, onViewPromissoria,
  onViewDoc, onReviewSignal, onOpenComprovante, onReverseTransaction, onOpenReceipt, setWithdrawModal, showToast,
  isStealthMode, onRenegotiate, onNewAporte, onMarkAsBilled, onAgreementPayment, onReverseAgreementPayment, onInstallmentPayment, onReverseInstallmentPayment, onNavigate, onOpenClient, onRefresh, ui, loanCtrl, isLoadingData = false
}) => {

  // Agrupa os empréstimos filtrados por cliente, respeitando a ordenação selecionada
  const groupedLoans = useMemo(() => groupLoansByClient(filteredLoans, sortOption), [filteredLoans, sortOption]);
  const isInitialContractsLoading = isLoadingData && loans.length === 0 && groupedLoans.length === 0;

  // Objeto com todas as props necessárias para o LoanCard (para passar via drill-down)
  const loanCardProps = {
      sources, activeUser, selectedLoanId, setSelectedLoanId, onEdit, onMessage, onArchive,
      onRestore, onDelete, onActivate, onNote, onPortalLink, onUploadPromissoria, onUploadDoc,
      onViewPromissoria, onViewDoc, onReviewSignal, onOpenComprovante, onReverseTransaction, onOpenReceipt,
      onRenegotiate, onNewAporte, onMarkAsBilled, onAgreementPayment, onReverseAgreementPayment, onInstallmentPayment, onReverseInstallmentPayment,
      onToggleCapitalOnly: loanCtrl.handleToggleCapitalOnlyRecovery,
      onNavigate: (id: string) => onNavigate(`/contrato/${id}`),
      onLegalDocument: onNavigate,
      onRefresh, isStealthMode
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="md:hidden bg-slate-900 p-1 rounded-lg border border-slate-800 flex relative overflow-hidden">
          <button onClick={() => setMobileDashboardTab('CONTRACTS')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mobileDashboardTab === 'CONTRACTS' ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30' : 'text-slate-500 hover:text-white'}`}>
            <Briefcase size={14} /> Contratos
          </button>
          <button onClick={() => setMobileDashboardTab('BALANCE')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mobileDashboardTab === 'BALANCE' ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/30' : 'text-slate-500 hover:text-white'}`}>
            <TrendingUp size={14} /> Balanço
          </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
          <div className={`flex-1 min-w-0 space-y-6 sm:space-y-8 ${mobileDashboardTab === 'BALANCE' ? 'hidden md:block' : ''}`}>
              <DashboardAlerts loans={loans} sources={sources} />
              <DashboardControls
                statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                sortOption={sortOption} setSortOption={setSortOption}
                searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                showToast={showToast}
                isMaster={activeUser?.accessLevel === 'ADMIN'}
                staffMembers={staffMembers}
                selectedStaffId={selectedStaffId}
                onStaffChange={onStaffChange}
              />

              {/* Lista de Contratos: Renderização Agrupada */}
              {groupedLoans.length > 0 ? (
                  <div key={groupedLoans.length} className="columns-1 xl:columns-2 2xl:columns-3 gap-4 cf-cards-flash">
                      {groupedLoans.map((group) => {
                          const isOverdueGroup = group.status === 'LATE' || group.status === 'CRITICAL';
                          return (
                              <div
                                key={group.id}
                                className={`mb-4 break-inside-avoid min-w-0 rounded-lg ${isOverdueGroup ? 'cf-overdue-container-pulse' : ''}`}
                              >
                                  <ClientGroupCard
                                      group={group}
                                      passThroughProps={loanCardProps}
                                      isStealthMode={isStealthMode}
                                      onOpenClient={onOpenClient}
                                  />
                              </div>
                          );
                      })}
                  </div>
              ) : (
                  // Empty State Otimizado
                  <div className="flex flex-col items-center justify-center py-20 px-6 bg-slate-900/50 border border-dashed border-slate-800 rounded-lg text-center mt-4">
                      <div className="w-20 h-20 bg-slate-900 rounded-lg flex items-center justify-center mb-6 shadow-2xl shadow-black/50 border border-slate-800 rotate-3 transition-transform hover:rotate-6">
                          <BarChart3 className="w-8 h-8 text-slate-500" />
                      </div>
                      <h3 className="text-white font-black uppercase text-lg mb-2">Nenhum contrato encontrado</h3>
                      <p className="text-slate-500 text-xs font-medium max-w-sm leading-relaxed">
                          Não encontramos registros com os filtros atuais. <br/>
                          Limpe a busca ou inicie uma nova operação.
                      </p>
                  </div>
              )}
          </div>

          <aside className={`w-full lg:w-80 shrink-0 min-w-0 space-y-5 sm:space-y-6 ${mobileDashboardTab === 'CONTRACTS' ? 'hidden md:block' : ''}`}>
              <div className="flex items-center justify-between px-2">
                  <h2 className="text-[10px] font-black uppercase text-slate-500">Indicadores</h2>
                  <button
                    onClick={loanCtrl.handleRecalculateAll}
                    disabled={ui.isProcessingPayment}
                    className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500 hover:text-blue-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={ui.isProcessingPayment ? 'animate-spin' : ''} />
                    Recalcular
                  </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">

                  {/* CARD CAPITAL NA RUA */}
                  <StatCard
                    variant="compact"
                    title="Capital na Rua"
                    value={`R$ ${stats.totalLent.toLocaleString()}`}
                    rawValue={stats.totalLent}
                    icon={<Banknote size={16} />}
                    target={activeUser?.targetCapital}
                    current={stats.totalLent}
                    isStealthMode={isStealthMode}
                    indicatorColor="bg-blue-500"
                    footer={
                        <>
                            <div className="flex items-center gap-1.5 text-blue-400">
                                <Users size={10}/>
                                <span className="text-[9px] font-black uppercase">{stats.activeCount} Contratos Ativos</span>
                            </div>
                        </>
                    }
                  />

                  {/* CARD RECEBIDO TOTAL */}
                  <StatCard
                    variant="compact"
                    title="Lucro Realizado"
                    value={`R$ ${stats.totalReceived.toLocaleString()}`}
                    rawValue={stats.totalReceived}
                    icon={<CheckCircle2 size={16} />}
                    isStealthMode={isStealthMode}
                    indicatorColor="bg-purple-500"
                    footer={
                        <>
                            <div className="flex items-center gap-1.5 text-purple-400">
                                <Calendar size={10}/>
                                <span className="text-[9px] font-black uppercase">+ {formatMoney(stats.receivedThisMonth, isStealthMode)} Lucro Mês</span>
                            </div>
                        </>
                    }
                  />

                  {/* CARD LUCRO TOTAL ESTIMADO */}
                  <StatCard
                    variant="compact"
                    title="Lucro Total (Est.)"
                    value={`R$ ${stats.expectedProfit.toLocaleString()}`}
                    rawValue={stats.expectedProfit}
                    icon={<Briefcase size={16} />}
                    target={activeUser?.targetProfit}
                    current={stats.expectedProfit}
                    isStealthMode={isStealthMode}
                    indicatorColor="bg-amber-500"
                    footer={
                        <>
                            <div className="flex items-center gap-1.5 text-amber-400">
                                <Percent size={10}/>
                                <span className="text-[9px] font-black uppercase">Retorno Est. {stats.roi.toFixed(1)}%</span>
                            </div>
                        </>
                    }
                  />

                  {/* CARD EXPOSIÇÃO AO RISCO */}
                  {(stats.totalAtRisk > 0 || stats.potentialDefaulterCount > 0) && (
                    <StatCard
                      variant="compact"
                      title="Exposição ao Risco"
                      value={`R$ ${stats.totalAtRisk.toLocaleString()}`}
                      rawValue={stats.totalAtRisk}
                      icon={<ShieldAlert size={16} />}
                      isStealthMode={isStealthMode}
                      indicatorColor="bg-rose-500"
                      footer={
                          <>
                              <div className="flex items-center gap-1.5 text-rose-400">
                                  <Skull size={10}/>
                                  <span className="text-[9px] font-black uppercase">{stats.potentialDefaulterCount} Potenciais Calotes</span>
                              </div>
                          </>
                      }
                    />
                  )}

                  {/* CARD LUCRO DISPONÍVEL */}
                  <ProfitCard variant="compact" balance={stats.interestBalance} onWithdraw={() => ui.openModal('WITHDRAW')} isStealthMode={isStealthMode} />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col items-center shadow-xl group hover:border-slate-700 transition-all">
                  <div className="flex items-center justify-between w-full mb-6">
                      <h3 className="card-title font-black uppercase text-slate-500 group-hover:text-slate-400 transition-colors flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              <PieIcon className="w-4 h-4" />
                          </div>
                          Saúde da Carteira
                      </h3>
                      <span className="text-[9px] font-black text-slate-600 uppercase">Tempo Real</span>
                  </div>

                  <div style={{ width: '100%', minHeight: 180 }}>
                      <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                              <Pie
                                data={stats.pieData}
                                innerRadius={55}
                                outerRadius={75}
                                paddingAngle={8}
                                dataKey="value"
                                stroke="none"
                                cornerRadius={6}
                              >
                                  {stats.pieData.map((entry: any, index: number) => (
                                      <Cell key={index} fill={entry.color} className="hover:opacity-80 transition-opacity cursor-pointer" />
                                  ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                                itemStyle={{ color: '#fff' }}
                              />
                          </PieChart>
                      </ResponsiveContainer>
                  </div>

                  <div className="flex items-center justify-between w-full mb-4 mt-8 pt-6 border-t border-slate-800/50">
                      <h3 className="card-title font-black uppercase text-slate-500 group-hover:text-slate-400 transition-colors flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                              <TrendingUp className="w-4 h-4" />
                          </div>
                          Evolução (6 Meses)
                      </h3>
                  </div>

                  <div style={{ width: '100%', minHeight: 180, marginBottom: '1rem' }}>
                      <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={stats.lineChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                              <XAxis
                                dataKey="name"
                                tick={{fontSize: 9, fill: '#475569', fontWeight: 900}}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                              />
                              <YAxis
                                tick={{fontSize: 9, fill: '#475569', fontWeight: 900}}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(val) => `R$ ${val/1000}k`}
                              />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}
                              />
                              <Line
                                type="monotone"
                                dataKey="Entradas"
                                stroke="#10b981"
                                strokeWidth={3}
                                dot={{r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#0f172a'}}
                                activeDot={{r: 5, strokeWidth: 0}}
                              />
                              <Line
                                type="monotone"
                                dataKey="Saidas"
                                stroke="#f43f5e"
                                strokeWidth={3}
                                dot={{r: 3, fill: '#f43f5e', strokeWidth: 2, stroke: '#0f172a'}}
                                activeDot={{r: 5, strokeWidth: 0}}
                              />
                          </LineChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              <AIBalanceInsight loans={loans} sources={sources} activeUser={activeUser} />
          </aside>
      </div>
    </div>
  );
};
