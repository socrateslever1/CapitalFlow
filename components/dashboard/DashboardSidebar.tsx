import React from 'react';
import { Banknote, CheckCircle2, Briefcase, PieChart as PieIcon, TrendingUp, Percent, Users, Calendar } from 'lucide-react';
import { NativeDonutChart, NativeTrendChart } from './NativeDashboardCharts';
import { StatCard } from '../StatCard';
import { ProfitCard } from '../cards/ProfitCard';
import { AIBalanceInsight } from '../../features/dashboard/AIBalanceInsight';
import { formatMoney } from '../../utils/formatters';

export const DashboardSidebar: React.FC<any> = ({ stats, activeUser, isStealthMode, setWithdrawModal, loans, sources }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        <StatCard
          title="Capital na Rua"
          value={`R$ ${stats.totalLent.toLocaleString()}`}
          rawValue={stats.totalLent}
          icon={<Banknote size={16} />}
          target={activeUser?.targetCapital}
          current={stats.totalLent}
          isStealthMode={isStealthMode}
          indicatorColor="bg-blue-500"
          footer={<div className="flex items-center gap-1 text-blue-400"><Users size={10}/><span className="text-[9px] font-black uppercase">{stats.activeCount} Contratos</span></div>}
        />
        <StatCard
          title="Recebido (Total)"
          value={`R$ ${stats.totalReceived.toLocaleString()}`}
          rawValue={stats.totalReceived}
          icon={<CheckCircle2 size={16} />}
          isStealthMode={isStealthMode}
          indicatorColor="bg-purple-500"
          footer={<div className="flex items-center gap-1 text-purple-400"><Calendar size={10}/><span className="text-[9px] font-black uppercase">+ {formatMoney(stats.receivedThisMonth, isStealthMode)} Este Mês</span></div>}
        />
        <StatCard
          title="Lucro Projetado"
          value={`R$ ${stats.expectedProfit.toLocaleString()}`}
          rawValue={stats.expectedProfit}
          icon={<Briefcase size={16} />}
          target={activeUser?.targetProfit}
          current={stats.expectedProfit}
          isStealthMode={isStealthMode}
          indicatorColor="bg-amber-500"
          footer={<div className="flex items-center gap-1 text-amber-400"><Percent size={10}/><span className="text-[9px] font-black uppercase">Retorno {stats.roi.toFixed(1)}%</span></div>}
        />
        <ProfitCard balance={stats.interestBalance} onWithdraw={() => setWithdrawModal()} isStealthMode={isStealthMode} />

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col items-center shadow-md">
            <h3 className="text-[9px] font-black uppercase mb-3 tracking-widest text-slate-500 flex items-center gap-2 w-full"><PieIcon className="w-3 h-3 text-blue-500" /> Saúde</h3>
            <NativeDonutChart data={stats.pieData} height={150} />
            <h3 className="text-[9px] font-black uppercase mb-2 mt-4 tracking-widest text-slate-500 flex items-center gap-2 w-full pt-3 border-t border-slate-800"><TrendingUp className="w-3 h-3 text-emerald-500" /> Evolução</h3>
            <NativeTrendChart data={stats.lineChartData} height={150} />
            <AIBalanceInsight loans={loans} sources={sources} activeUser={activeUser} />
        </div>
    </div>
  );
};
