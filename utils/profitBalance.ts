import { CapitalSource } from '../types';

export const normalizeSourceName = (value: any) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const isProfitSource = (source: Partial<CapitalSource> | any) => {
  if (!source) return false;
  if (source.is_caixa_livre === true || source.isCaixaLivre === true || source.is_profit_box === true) return true;
  const name = normalizeSourceName(source.name || source.nome);
  return name.includes('caixa livre') ||
    name.includes('lucro') ||
    name.includes('disponivel') ||
    name.includes('balance');
};

export const resolveProfitBalance = (sources: Partial<CapitalSource>[] = [], activeUser: any = null) => {
  const profitSources = Array.isArray(sources) ? sources.filter(isProfitSource) : [];
  const sourceBalance = profitSources.reduce((acc, source: any) => acc + (Number(source.balance) || 0), 0);
  const profileBalance = Number(activeUser?.interestBalance ?? activeUser?.interest_balance ?? 0) || 0;

  return {
    balance: profitSources.length > 0 ? sourceBalance : profileBalance,
    sourceBalance,
    profileBalance,
    sources: profitSources,
    primarySource: profitSources[0] || null,
    mode: profitSources.length > 0 ? 'SOURCE' as const : 'PROFILE' as const,
  };
};
