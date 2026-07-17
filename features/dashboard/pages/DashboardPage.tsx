import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { CapitalSource, Loan } from '../../../types';
import { filterOperationalSources } from '../../../utils/testSource';

export const DashboardAlerts = ({
  loans: _loans,
  sources,
}: {
  loans: Loan[];
  sources?: CapitalSource[];
}) => {
  const lowBalanceSources = filterOperationalSources(sources || []).filter((source) => (Number(source.balance) || 0) < 100);

  const [isBalanceDismissed, setIsBalanceDismissed] = useState(() => {
    const stored = localStorage.getItem('cm_alert_balance_dismissed');
    if (!stored) return false;
    return Date.now() - Number(stored) < 86400000;
  });

  const handleDismissBalance = () => {
    setIsBalanceDismissed(true);
    localStorage.setItem('cm_alert_balance_dismissed', String(Date.now()));
  };

  if (lowBalanceSources.length === 0 || isBalanceDismissed) return null;

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex items-center gap-4 relative pr-10">
        <button
          onClick={handleDismissBalance}
          className="absolute top-3 right-3 text-amber-400/50 hover:text-white transition-colors p-1 rounded-full hover:bg-amber-500/20"
          title="Fechar por 24h"
        >
          <X size={14} />
        </button>

        <div className="p-3 bg-amber-500 rounded-lg text-black shadow-lg shadow-amber-900/20 flex-shrink-0">
          <AlertTriangle size={24} />
        </div>

        <div>
          <p className="text-white font-bold text-sm uppercase">Saldo Baixo</p>
          <p className="text-amber-400 text-xs font-medium">
            {lowBalanceSources.length === 1
              ? `A fonte "${lowBalanceSources[0].name}" esta quase zerada.`
              : `${lowBalanceSources.length} fontes estao com saldo critico (< R$ 100).`}
          </p>
        </div>
      </div>
    </div>
  );
};
