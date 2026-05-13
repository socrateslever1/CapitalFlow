import React from 'react';

interface DashboardLayoutProps {
  header: React.ReactNode;
  content: React.ReactNode;
  sidebar: React.ReactNode;
  mobileDashboardTab: 'CONTRACTS' | 'BALANCE';
  setMobileDashboardTab: (val: 'CONTRACTS' | 'BALANCE') => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  header, content, sidebar, mobileDashboardTab, setMobileDashboardTab
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="md:hidden bg-slate-900 p-1 rounded-xl border border-slate-800 flex relative">
          <button onClick={() => setMobileDashboardTab('CONTRACTS')} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileDashboardTab === 'CONTRACTS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Contratos</button>
          <button onClick={() => setMobileDashboardTab('BALANCE')} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileDashboardTab === 'BALANCE' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Balanço</button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
          <div className={`flex-1 min-w-0 space-y-4 ${mobileDashboardTab === 'BALANCE' ? 'hidden md:block' : ''}`}>
              {header}
              {content}
          </div>

          <aside className={`w-full lg:w-72 shrink-0 min-w-0 space-y-4 ${mobileDashboardTab === 'CONTRACTS' ? 'hidden md:block' : ''}`}>
              {sidebar}
          </aside>
      </div>
    </div>
  );
};
