import { useState, useMemo } from 'react';

export type FilterType = 'ALL' | 'RECEITA' | 'RECUPERACAO' | 'APORTE' | 'CAIXA';

export const useExtrato = () => {
  const [period, setPeriod] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [filter, setFilter] = useState<FilterType>('ALL');

  const dreData = useMemo(() => {
    return {
      grossRevenue: 10000,
      interestReceived: 500,
      lateFeeReceived: 200,
      principalRecovered: 3000,
      investment: 2000,
      cashFlow: 5000,
      netResult: 5000,
    };
  }, [period, filter]);

  const variations = useMemo(() => {
    return {
      grossRevenue: { diff: 1000, percent: 10, isImprovement: true },
      principalRecovered: { diff: 500, percent: 5, isImprovement: true },
      investment: { diff: -200, percent: -2, isImprovement: false },
      cashFlow: { diff: 1000, percent: 10, isImprovement: true },
    };
  }, [period, filter]);

  const filteredTransactions = useMemo(() => {
    return [];
  }, [period, filter]);

  const handleMonthChange = (month: number, year: number) => setPeriod({ month, year });
  const clearFilter = () => setFilter('ALL');

  const aiContext = useMemo(() => {
    return {
      period,
      filter,
      dreData,
    };
  }, [period, filter, dreData]);

  return {
    selectedMonth: period.month,
    selectedYear: period.year,
    handleMonthChange,
    activeFilter: filter,
    setActiveFilter: setFilter,
    filteredTransactions,
    dre: dreData,
    variations,
    clearFilter,
    aiContext,
  };
};
