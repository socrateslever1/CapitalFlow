
import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  PieChart, 
  BarChart3, 
  ArrowUpRight, 
  ShieldAlert,
  Wallet,
  Target,
  BarChart,
  LineChart,
  Activity
} from 'lucide-react';
import { Loan, CapitalSource, UserProfile } from '../../../types';
import { formatMoney } from '../../../utils/formatters';

interface ReportsPageProps {
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  isStealthMode?: boolean;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ 
  loans, 
  sources, 
  activeUser,
  isStealthMode 
}) => {
  const stats = useMemo(() => {
    const activeLoans = loans.filter(l => !l.isArchived);
    const totalPrincipal = activeLoans.reduce((acc, l) => acc + (l.principal || 0), 0);
    
    // Inadimplência
    const lateLoans = activeLoans.filter(l => l.status === 'ATRASADO' || l.status === 'ATRASO_CRITICO');
    const latePrincipal = lateLoans.reduce((acc, l) => acc + (l.principal || 0), 0);
    const defaultRate = totalPrincipal > 0 ? (latePrincipal / totalPrincipal) * 100 : 0;
    
    // Lucro Esperado (Total a Receber - Principal)
    const totalToReceive = activeLoans.reduce((acc, l) => acc + (l.totalToReceive || 0), 0);
    const grossProfit = totalToReceive - totalPrincipal;
    
    // ROI Estimado
    const estimatedROI = totalPrincipal > 0 ? (grossProfit / totalPrincipal) * 100 : 0;

    // Capital disponível vs Alocado
    const totalBalance = sources.reduce((acc, s) => acc + (s.balance || 0), 0);
    const allocationRate = (totalBalance + totalPrincipal) > 0 ? (totalPrincipal / (totalBalance + totalPrincipal)) * 100 : 0;

    return {
      totalPrincipal,
      latePrincipal,
      defaultRate,
      grossProfit,
      estimatedROI,
      totalBalance,
      allocationRate,
      activeLoansCount: activeLoans.length,
      lateLoansCount: lateLoans.length
    };
  }, [loans, sources]);

  const maskValue = (val: string) => isStealthMode ? '••••••' : val;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header com Resumo Executivo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 rounded-full">
              <PieChart className="text-indigo-500" size={24}/>
            </div>
            Inteligência de <span className="text-indigo-500">Negócios</span>
          </h1>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">
            Análise de performance, risco e rentabilidade da carteira
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
          <div className="px-3 py-1 bg-slate-800 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Filtro: Ativos
          </div>
          <div className="px-3 py-1 bg-indigo-500/10 rounded-xl text-[10px] font-black text-indigo-500 uppercase tracking-widest border border-indigo-500/20">
            Escopo: Geral
          </div>
        </div>
      </div>

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Taxa de Inadimplência */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <ShieldAlert size={80} className="text-rose-500"/>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Inadimplência (NPL)</p>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-2xl font-black tracking-tighter ${stats.defaultRate > 15 ? 'text-rose-500' : 'text-white'}`}>
              {stats.defaultRate.toFixed(1)}%
            </h3>
            <span className="text-[10px] font-bold text-slate-500">DA CARTEIRA</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-rose-500 transition-all duration-1000" 
                style={{ width: `${Math.min(100, stats.defaultRate)}%` }}
              />
            </div>
          </div>
          <p className="text-[9px] text-slate-600 mt-2 font-medium">
            Representa {maskValue(formatMoney(stats.latePrincipal))} em risco crítico.
          </p>
        </div>

        {/* KPI: ROI Estimado */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingUp size={80} className="text-emerald-500"/>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Yield da Carteira (ROI)</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black text-white tracking-tighter">
              +{stats.estimatedROI.toFixed(1)}%
            </h3>
            <span className="text-[10px] font-bold text-emerald-500">MÉDIA BRUTA</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-1000" 
                style={{ width: `${Math.min(100, stats.estimatedROI)}%` }}
              />
            </div>
          </div>
          <p className="text-[9px] text-slate-600 mt-2 font-medium">
            Lucro planejado: {maskValue(formatMoney(stats.grossProfit))}.
          </p>
        </div>

        {/* KPI: Alocação de Capital */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Activity size={80} className="text-blue-500"/>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Taxa de Alocação</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black text-white tracking-tighter">
              {stats.allocationRate.toFixed(1)}%
            </h3>
            <span className="text-[10px] font-bold text-blue-500">EM CAMPO</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000" 
                style={{ width: `${stats.allocationRate}%` }}
              />
            </div>
          </div>
          <p className="text-[9px] text-slate-600 mt-2 font-medium">
            Capital em ociosidade: {maskValue(formatMoney(stats.totalBalance))}.
          </p>
        </div>

        {/* KPI: Ticket Médio */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <BarChart size={80} className="text-amber-500"/>
          </div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Ticket Médio</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black text-white tracking-tighter">
              {maskValue(formatMoney(stats.activeLoansCount > 0 ? stats.totalPrincipal / stats.activeLoansCount : 0))}
            </h3>
          </div>
          <div className="mt-4 flex items-center gap-2">
             <div className="p-1 px-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">{stats.activeLoansCount} CONTRATOS ATIVOS</span>
             </div>
          </div>
          <p className="text-[9px] text-slate-600 mt-2 font-medium">
            Média de capital por devedor.
          </p>
        </div>
      </div>

      {/* Visualização Detalhada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gráfico de Barras - Distribuição por Fonte */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2">
              <Wallet size={16} className="text-indigo-500"/>
              Performance por Fonte de Capital
            </h4>
          </div>
          
          <div className="space-y-4">
            {sources.map(source => {
              const sourceLoans = loans.filter(l => l.sourceId === source.id && !l.isArchived);
              const sourcePrincipal = sourceLoans.reduce((acc, l) => acc + (l.principal || 0), 0);
              const percentage = stats.totalPrincipal > 0 ? (sourcePrincipal / stats.totalPrincipal) * 100 : 0;
              
              return (
                <div key={source.id} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">{source.name}</span>
                    <span className="text-[11px] font-black text-white">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden p-0.5">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-medium text-slate-600">
                    <span>Alocado: {maskValue(formatMoney(sourcePrincipal))}</span>
                    <span>Saldo: {maskValue(formatMoney(source.balance || 0))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Radar de Risco / Sugestões da IA (Placeholder para Feature Inteligente) */}
        <div className="bg-indigo-600/5 border border-indigo-600/20 p-8 rounded-3xl relative overflow-hidden flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-900/50 mb-6 rotate-12">
                <Target size={32} className="text-white"/>
            </div>
            <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Previsibilidade Financeira</h4>
            <p className="text-slate-400 text-sm max-w-sm mb-6">
                Com base nos últimos {loans.length} movimentos, sua taxa de reinvestimento está em {stats.allocationRate.toFixed(1)}%. 
                {stats.defaultRate < 10 ? ' Sua saúde financeira está excelente!' : ' Atenção ao crescimento da inadimplência.'}
            </p>
            
            <div className="flex gap-3">
                <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                    Previsão para 30 dias: {maskValue(formatMoney(stats.totalPrincipal * 1.05))}
                </div>
            </div>

            {/* Background Decor */}
            <div className="absolute bottom-0 right-0 opacity-5 -mb-10 -mr-10">
                <BarChart3 size={240} className="text-indigo-500"/>
            </div>
        </div>
      </div>
    </div>
  );
};
