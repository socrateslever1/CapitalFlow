import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  Calendar as CalendarIcon,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  CreditCard,
  Loader2,
  Percent,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { formatDate } from '../../utils/loanCalculator';
import { formatMoney } from '../../utils/formatters';
import { modalityRegistry } from '../../domain/finance/modalities/registry';
import { mapFormToLoan } from '../loans/domain/loanForm.mapper';
import { LoanBillingModality } from '../../types';

interface SimulatorPanelProps {
  onClose: () => void;
  activeUser: any;
  clients: any[];
  sources: any[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  fetchFullData: (id: string) => Promise<void>;
  isStealthMode?: boolean;
}

function pmt(principal: number, monthlyRatePercent: number, installmentsCount: number): number {
  const n = Math.max(1, Math.floor(installmentsCount));
  const i = monthlyRatePercent / 100;
  if (i <= 0) return principal / n;
  return principal * (i / (1 - Math.pow(1 + i, -n)));
}

const cleanNumberInput = (value: string): number => {
  let raw = value;
  if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) raw = raw.replace(/^0+/, '');
  return raw === '' ? 0 : Number(raw);
};

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({
  onClose,
  activeUser,
  clients,
  sources,
  showToast,
  fetchFullData,
  isStealthMode,
}) => {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedModality, setSelectedModality] = useState<LoanBillingModality>('MONTHLY');
  const [startDateStr, setStartDateStr] = useState(() => new Date().toISOString().split('T')[0]);
  const [principal, setPrincipal] = useState(1000);
  const [interestRate, setInterestRate] = useState(30);
  const [fixedDuration, setFixedDuration] = useState('30');
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [calculationMode, setCalculationMode] = useState<'NORMAL' | 'REVERSE'>('NORMAL');
  const [targetInstallment, setTargetInstallment] = useState(1300);
  const [fundingCalculationMode, setFundingCalculationMode] = useState<'TOTAL' | 'RATE'>('TOTAL');
  const [fundingInstallmentsCount, setFundingInstallmentsCount] = useState(10);
  const [customerMarginPercent, setCustomerMarginPercent] = useState(30);
  const [fundingTotalPayable, setFundingTotalPayable] = useState(1200);
  const [fundingMonthlyRate, setFundingMonthlyRate] = useState(4.49);
  const [isSavingContract, setIsSavingContract] = useState(false);

  const calculation = useMemo(() => {
    let effectivePrincipal = principal;
    if (calculationMode === 'REVERSE' && selectedModality !== 'INSTALLMENT_FIXED') {
      if (selectedModality === 'MONTHLY' || selectedModality === 'DAILY_FIXED_TERM') {
        effectivePrincipal = targetInstallment / (1 + interestRate / 100);
      } else if (selectedModality === 'DAILY_FREE') {
        effectivePrincipal = targetInstallment;
      }
    }

    try {
      const strategy = modalityRegistry.get(selectedModality);
      const { installments: installmentList, totalToReceive } = strategy.generateInstallments({
        principal: effectivePrincipal,
        rate: interestRate,
        startDate: startDateStr,
        fixedDuration,
        fundingTotalPayable,
        fundingInstallmentsCount,
        fundingMonthlyRate,
        fundingCalculationMode,
        customerMarginPercent,
        initialData: { skipWeekends } as any,
      });

      const totalInterest = Math.max(0, totalToReceive - effectivePrincipal);
      const dueDateStr = installmentList[installmentList.length - 1]?.dueDate || startDateStr;

      return {
        installmentList,
        total: totalToReceive,
        principal: effectivePrincipal,
        interest: totalInterest,
        cet: effectivePrincipal > 0 ? (totalInterest / effectivePrincipal) * 100 : 0,
        monthlyRate:
          selectedModality === 'INSTALLMENT_FIXED'
            ? fundingMonthlyRate * (1 + customerMarginPercent / 100)
            : interestRate,
        dueDate: new Date(`${dueDateStr}T12:00:00`),
        installmentValue: installmentList[0]?.amount || 0,
      };
    } catch (error) {
      console.error(error);
      return {
        installmentList: [],
        total: 0,
        principal: effectivePrincipal,
        interest: 0,
        cet: 0,
        monthlyRate: 0,
        dueDate: new Date(),
        installmentValue: 0,
      };
    }
  }, [
    selectedModality,
    principal,
    interestRate,
    startDateStr,
    fixedDuration,
    fundingTotalPayable,
    fundingInstallmentsCount,
    fundingMonthlyRate,
    fundingCalculationMode,
    customerMarginPercent,
    skipWeekends,
    calculationMode,
    targetInstallment,
  ]);

  const handleCreateContract = async () => {
    if (!activeUser) return showToast('Você precisa estar logado para criar um contrato.', 'error');
    if (!selectedClientId) return showToast('Selecione um cliente para criar o contrato.', 'error');
    if (!selectedSourceId) return showToast('Selecione uma fonte de capital.', 'error');

    setIsSavingContract(true);
    try {
      const { contractsService } = await import('../../services/contracts.service');
      const client = clients.find((item) => item.id === selectedClientId);
      const formState: any = {
        clientId: selectedClientId,
        debtorName: client?.name || '',
        debtorPhone: client?.phone || '',
        debtorDocument: client?.document || '',
        debtorAddress: client?.address || '',
        sourceId: selectedSourceId,
        preferredPaymentMethod: 'PIX',
        pixKey: activeUser?.pixKey || '',
        principal: String(calculation.principal),
        interestRate: String(interestRate),
        finePercent: '2',
        dailyInterestPercent: '0.1',
        billingCycle: selectedModality,
        notes: 'Gerado via Simulador Financeiro',
        guaranteeDescription: '',
        startDate: startDateStr,
        skipWeekends,
        fundingTotalPayable:
          selectedModality === 'INSTALLMENT_FIXED' ? String(fundingTotalPayable) : undefined,
        fundingProvider: selectedModality === 'INSTALLMENT_FIXED' ? 'Simulador' : undefined,
        fundingCalculationMode:
          selectedModality === 'INSTALLMENT_FIXED' ? fundingCalculationMode : undefined,
        fundingInstallmentsCount:
          selectedModality === 'INSTALLMENT_FIXED' ? String(fundingInstallmentsCount) : undefined,
        fundingMonthlyRate:
          selectedModality === 'INSTALLMENT_FIXED' ? String(fundingMonthlyRate) : undefined,
        customerMarginPercent:
          selectedModality === 'INSTALLMENT_FIXED' ? String(customerMarginPercent) : undefined,
      };

      const loanPayload = mapFormToLoan(
        formState,
        fixedDuration,
        null,
        [],
        [],
        [],
        activeUser?.id || '',
      );

      await contractsService.saveLoan(loanPayload, activeUser, sources, null);
      showToast('Contrato criado com sucesso!', 'success');
      await fetchFullData(activeUser.id);
      onClose();
    } catch (error: any) {
      showToast(`Erro ao criar contrato: ${error.message}`, 'error');
    } finally {
      setIsSavingContract(false);
    }
  };

  const inputClass =
    'w-full h-12 rounded-lg border border-slate-800 bg-[#050b18] px-4 text-sm font-bold text-white outline-none transition focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/10';
  const labelClass = 'mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500';
  const selectedClient = clients.find((item) => item.id === selectedClientId);
  const selectedSource = sources.find((item) => item.id === selectedSourceId);
  const installmentCount = Math.max(1, calculation.installmentList.length);
  const modalityLabel =
    selectedModality === 'MONTHLY'
      ? 'Mensal'
      : selectedModality === 'INSTALLMENT_FIXED'
        ? 'Parcelado'
        : selectedModality === 'DAILY_FREE'
          ? 'Diário livre'
          : 'Prazo fixo';

  const MetricRow = ({
    icon,
    label,
    value,
    tone,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    tone: string;
  }) => (
    <div className="flex items-center gap-4 border-b border-slate-800/70 py-4 last:border-b-0">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="animate-in fade-in pb-28 font-sans duration-300">
      <header className="mb-7 flex items-center gap-4 border-b border-slate-800/70 pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-500/30 bg-blue-600 text-white shadow-[0_0_28px_rgba(37,99,235,0.35)]">
          <Calculator size={25} />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-[0.04em] text-white sm:text-2xl">
            Simulador <span className="text-blue-500">Financeiro</span>
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Cálculos e projeções</p>
        </div>
      </header>

      <div className="grid gap-0 overflow-hidden border-y border-slate-800/70 bg-[#020817]/40 min-[680px]:grid-cols-[1fr_1.05fr]">
        <section className="border-b border-slate-800/70 px-3 py-6 min-[680px]:border-b-0 min-[680px]:border-r min-[680px]:px-5">
          <h2 className="mb-5 text-xs font-black uppercase tracking-[0.08em] text-blue-500">1. Parâmetros do empréstimo</h2>

          {selectedModality !== 'INSTALLMENT_FIXED' && (
            <div className="mb-4">
              <p className={labelClass}>Tipo de simulação</p>
              <div className="grid grid-cols-2 gap-2">
                {(['NORMAL', 'REVERSE'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCalculationMode(mode)}
                    className={`h-11 rounded-lg border text-[11px] font-black uppercase transition ${
                      calculationMode === mode
                        ? 'border-blue-500 bg-blue-600 text-white shadow-[0_0_18px_rgba(37,99,235,0.22)]'
                        : 'border-slate-800 bg-[#050b18] text-slate-500'
                    }`}
                  >
                    {mode === 'NORMAL' ? 'Normal' : 'Reversa'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-2">
            {[
              ['MONTHLY', 'Mensal'],
              ['INSTALLMENT_FIXED', 'Parcelado'],
              ['DAILY_FREE', 'Diário livre'],
              ['DAILY_FIXED_TERM', 'Prazo fixo'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSelectedModality(value as LoanBillingModality);
                  if (value === 'INSTALLMENT_FIXED') setCalculationMode('NORMAL');
                }}
                className={`h-11 rounded-lg border px-2 text-[10px] font-black uppercase transition ${
                  selectedModality === value
                    ? 'border-blue-500 bg-blue-600 text-white shadow-[0_0_18px_rgba(37,99,235,0.22)]'
                    : 'border-slate-800 bg-[#050b18] text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div>
              <label className={labelClass}>Vincular ao cliente</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={17} />
                <select
                  value={selectedClientId}
                  onChange={(event) => setSelectedClientId(event.target.value)}
                  className={`${inputClass} appearance-none pl-11 pr-10`}
                >
                  <option value="">Selecione um cliente...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Fonte de capital</label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={17} />
                <select
                  value={selectedSourceId}
                  onChange={(event) => setSelectedSourceId(event.target.value)}
                  className={`${inputClass} appearance-none pl-11 pr-10`}
                >
                  <option value="">Selecione uma fonte...</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} ({formatMoney(source.balance, isStealthMode)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Data do contrato</label>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={17} />
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(event) => setStartDateStr(event.target.value)}
                  className={`${inputClass} pl-11`}
                />
              </div>
            </div>

            {selectedModality !== 'INSTALLMENT_FIXED' ? (
              <>
                <div>
                  <label className={labelClass}>
                    {calculationMode === 'REVERSE' ? 'Valor do pagamento desejado (R$)' : 'Valor do capital (R$)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-blue-500">R$</span>
                    <input
                      type="number"
                      value={calculationMode === 'REVERSE' ? targetInstallment : principal}
                      onChange={(event) => {
                        const value = cleanNumberInput(event.target.value);
                        calculationMode === 'REVERSE' ? setTargetInstallment(value) : setPrincipal(value);
                      }}
                      className={`${inputClass} pl-11 text-base`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    {selectedModality === 'MONTHLY' ? 'Juros (%) mensal' : 'Taxa (%) mensal'}
                  </label>
                  <div className="relative">
                    <Percent className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" size={17} />
                    <input
                      type="number"
                      step="0.01"
                      value={interestRate}
                      onChange={(event) => setInterestRate(cleanNumberInput(event.target.value))}
                      className={`${inputClass} pl-11 text-base`}
                    />
                  </div>
                </div>

                {calculationMode === 'REVERSE' && (
                  <div>
                    <label className={labelClass}>Capital que pode ser liberado</label>
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-base font-black text-blue-400">
                      {formatMoney(calculation.principal, isStealthMode)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-5 border-t border-slate-800/70 pt-5">
                <div>
                  <label className={labelClass}>Valor do capital (R$)</label>
                  <input
                    type="number"
                    value={principal}
                    onChange={(event) => setPrincipal(cleanNumberInput(event.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Margem do cliente (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={customerMarginPercent}
                    onChange={(event) => setCustomerMarginPercent(cleanNumberInput(event.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Parcelas do banco</label>
                  <input
                    type="number"
                    min="1"
                    value={fundingInstallmentsCount}
                    onChange={(event) => setFundingInstallmentsCount(cleanNumberInput(event.target.value))}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['TOTAL', 'RATE'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFundingCalculationMode(mode)}
                      className={`h-10 rounded-lg border text-[9px] font-black uppercase ${
                        fundingCalculationMode === mode
                          ? 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300'
                          : 'border-slate-800 bg-[#050b18] text-slate-500'
                      }`}
                    >
                      {mode === 'TOTAL' ? 'Valor final' : 'Taxa mensal'}
                    </button>
                  ))}
                </div>
                {fundingCalculationMode === 'RATE' ? (
                  <div>
                    <label className={labelClass}>Juros do banco (% ao mês)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={fundingMonthlyRate}
                      onChange={(event) => setFundingMonthlyRate(cleanNumberInput(event.target.value))}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Total a pagar ao banco</label>
                    <input
                      type="number"
                      step="0.01"
                      value={fundingTotalPayable}
                      onChange={(event) => setFundingTotalPayable(cleanNumberInput(event.target.value))}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            )}

            {selectedModality === 'DAILY_FIXED_TERM' && (
              <div>
                <label className={labelClass}>Prazo total (dias)</label>
                <input
                  type="number"
                  min="1"
                  value={fixedDuration}
                  onChange={(event) => setFixedDuration(String(cleanNumberInput(event.target.value)))}
                  className={inputClass}
                />
              </div>
            )}

            {(selectedModality === 'DAILY_FREE' || selectedModality === 'DAILY_FIXED_TERM') && (
              <button
                type="button"
                onClick={() => setSkipWeekends((current) => !current)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-[#050b18] px-4 py-3 text-left"
              >
                <span className="flex items-center gap-3">
                  <CalendarX size={18} className={skipWeekends ? 'text-blue-400' : 'text-slate-500'} />
                  <span>
                    <span className="block text-xs font-black text-white">Pular fins de semana</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Apenas dias úteis</span>
                  </span>
                </span>
                <span className={`relative h-6 w-11 rounded-full transition ${skipWeekends ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${skipWeekends ? 'left-6' : 'left-1'}`} />
                </span>
              </button>
            )}
          </div>
        </section>

        <section className="px-3 py-6 min-[680px]:px-6">
          <h2 className="mb-3 text-xs font-black uppercase tracking-[0.08em] text-blue-500">2. Resumo do cálculo</h2>

          <div>
            <MetricRow
              icon={<Coins size={20} />}
              label="Capital base"
              value={formatMoney(calculation.principal, isStealthMode)}
              tone="border-blue-500/25 bg-blue-500/10 text-blue-400"
            />
            <MetricRow
              icon={<Percent size={20} />}
              label="Juros totais"
              value={formatMoney(calculation.interest, isStealthMode)}
              tone="border-violet-500/25 bg-violet-500/10 text-violet-400"
            />
            <MetricRow
              icon={<Calculator size={20} />}
              label={selectedModality === 'INSTALLMENT_FIXED' ? 'Valor da parcela' : 'Valor da cobrança'}
              value={formatMoney(calculation.installmentValue || calculation.total, isStealthMode)}
              tone="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            />
            <MetricRow
              icon={<TrendingUp size={20} />}
              label="Juros mensal (equiv.)"
              value={`${calculation.monthlyRate.toFixed(1)}%`}
              tone="border-amber-500/25 bg-amber-500/10 text-amber-400"
            />
            <MetricRow
              icon={<TrendingUp size={20} />}
              label="Custo efetivo (CET)"
              value={`+${calculation.cet.toFixed(1)}%`}
              tone="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            />
          </div>

          <div className="mt-6 rounded-lg border border-blue-500/60 bg-blue-500/[0.04] px-5 py-5 text-center shadow-[inset_0_0_28px_rgba(37,99,235,0.05)]">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-500">Valor final total</p>
            <p className="mt-2 text-3xl font-black text-white">{formatMoney(calculation.total, isStealthMode)}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 divide-x divide-slate-800 rounded-lg border border-slate-800 bg-[#050b18]">
            <div className="flex items-center gap-3 px-4 py-4">
              <CalendarIcon size={18} className="text-blue-500" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Vencimento final</p>
                <p className="mt-1 text-xs font-black text-white">{formatDate(calculation.dueDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-4">
              <Clock3 size={18} className="text-blue-500" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Prazo</p>
                <p className="mt-1 text-xs font-black text-white">
                  {selectedModality === 'INSTALLMENT_FIXED'
                    ? `${installmentCount} parcelas`
                    : selectedModality === 'MONTHLY'
                      ? '1 mês'
                      : `${Math.max(1, Number(fixedDuration || 1))} dias`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-slate-800/70 pt-5 text-[10px] font-bold text-slate-500">
            <div className="flex justify-between gap-4"><span>Modalidade</span><span className="text-slate-300">{modalityLabel}</span></div>
            <div className="flex justify-between gap-4"><span>Cliente</span><span className="truncate text-slate-300">{selectedClient?.name || 'Não selecionado'}</span></div>
            <div className="flex justify-between gap-4"><span>Fonte</span><span className="truncate text-slate-300">{selectedSource?.name || 'Não selecionada'}</span></div>
            {selectedModality === 'INSTALLMENT_FIXED' && (
              <div className="flex justify-between gap-4"><span>Custo bancário</span><span className="text-fuchsia-300">{formatMoney(Math.max(0, (fundingCalculationMode === 'RATE' ? pmt(principal, fundingMonthlyRate, fundingInstallmentsCount) * fundingInstallmentsCount : fundingTotalPayable) - principal), isStealthMode)}</span></div>
            )}
          </div>
        </section>
      </div>

      <section className="border-b border-slate-800/70 px-3 py-7 sm:px-5">
        <h2 className="mb-5 text-xs font-black uppercase tracking-[0.08em] text-blue-500">3. Finalizar operação</h2>
        <button
          type="button"
          onClick={handleCreateContract}
          disabled={isSavingContract || !selectedClientId || !selectedSourceId}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-lg border border-emerald-400/60 bg-gradient-to-r from-emerald-700 to-emerald-600 text-sm font-black uppercase tracking-[0.05em] text-white shadow-[0_0_28px_rgba(5,150,105,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isSavingContract ? <Loader2 size={21} className="animate-spin" /> : <CheckCircle2 size={21} />}
          {isSavingContract ? 'Gerando contrato...' : 'Gerar contrato real'}
        </button>
        <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-wider text-slate-600">
          Selecione cliente e fonte para habilitar a criação do contrato
        </p>
      </section>
    </div>
  );
};
