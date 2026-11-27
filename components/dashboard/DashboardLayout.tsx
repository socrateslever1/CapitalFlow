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
      <div className="md:hidden cf-seg">
          <button onClick={() => setMobileDashboardTab('CONTRACTS')} type="button" data-active={mobileDashboardTab === 'CONTRACTS'} className="cf-seg-tab">Contratos</button>
          <button onClick={() => setMobileDashboardTab('BALANCE')} type="button" data-active={mobileDashboardTab === 'BALANCE'} className="cf-seg-tab">Balanço</button>
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
