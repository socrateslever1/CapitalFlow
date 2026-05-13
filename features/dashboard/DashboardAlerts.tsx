import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';
import { Loan, CapitalSource } from '../../types';
import { getDaysDiff } from '../../utils/dateHelpers';
import { motion, AnimatePresence } from 'framer-motion';

export const DashboardAlerts = ({ loans, sources }: { loans: Loan[]; sources?: CapitalSource[] }) => {
  const activeLoans = loans.filter((l) => !l.isArchived);
  const critical = activeLoans.filter((l) =>
    l.installments.some((i) => getDaysDiff(i.dueDate) > 30 && i.status !== 'PAID')
  ).length;

  // Alerta de Saldo Baixo (< R$ 100,00)
  const lowBalanceSources = (sources || []).filter((s) => s.balance < 100);

  // Lógica de Dispensa (24h)
  const [isDismissed, setIsDismissed] = useState(() => {
    const stored = localStorage.getItem('cm_alert_critical_dismissed');
    if (!stored) return false;
    const timestamp = Number(stored);
    const now = Date.now();
    return now - timestamp < 86400000;
  });

  const [isBalanceDismissed, setIsBalanceDismissed] = useState(() => {
    const stored = localStorage.getItem('cm_alert_balance_dismissed');
    if (!stored) return false;
    const timestamp = Number(stored);
    const now = Date.now();
    return now - timestamp < 86400000;
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('cm_alert_critical_dismissed', String(Date.now()));
  };

  const handleDismissBalance = () => {
    setIsBalanceDismissed(true);
    localStorage.setItem('cm_alert_balance_dismissed', String(Date.now()));
  };

  if ((critical === 0 || isDismissed) && (lowBalanceSources.length === 0 || isBalanceDismissed)) return null;

  const alerts = [];
  if (critical > 0 && !isDismissed) {
    alerts.push({
      id: 'critical',
      title: 'Atenção Necessária',
      message: `${critical} contratos com atraso crítico superior a 30 dias.`,
      color: 'rose',
      icon: <ShieldAlert size={14} />,
      onDismiss: handleDismiss,
      priority: 1
    });
  }
  if (lowBalanceSources.length > 0 && !isBalanceDismissed) {
    alerts.push({
      id: 'balance',
      title: 'Saldo Baixo',
      message: lowBalanceSources.length === 1
        ? `A fonte "${lowBalanceSources[0].name}" está quase zerada.`
        : `${lowBalanceSources.length} fontes estão com saldo crítico (< R$ 100).`,
      color: 'amber',
      icon: <AlertTriangle size={14} />,
      onDismiss: handleDismissBalance,
      priority: 2
    });
  }

  // Ordena por prioridade (menor número = mais importante = topo)
  const sortedAlerts = [...alerts].sort((a, b) => a.priority - b.priority);

  return (
    <div className="relative h-8 mb-3 mt-0.5 flex justify-center sm:justify-start">
      <AnimatePresence mode="popLayout">
        {sortedAlerts.length > 0 && (
          <motion.div
            key={sortedAlerts[0].id}
            initial={{ y: 5, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ x: 30, opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(e, { offset, velocity }) => {
              if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 400) {
                sortedAlerts[0].onDismiss();
              }
            }}
            className="cursor-grab active:cursor-grabbing max-w-full"
          >
            {/* Main Content Card (Front) - Ultra Compact */}
            <div className={`relative p-1 px-2.5 rounded-lg flex items-center gap-2 border shadow-sm transition-colors duration-300 ${
              sortedAlerts[0].color === 'rose' 
                ? 'bg-rose-600/80 backdrop-blur-md border-rose-500/50 text-white shadow-rose-900/10' 
                : 'bg-amber-500/80 backdrop-blur-md border-amber-400/50 text-black shadow-amber-900/10'
            }`}>
              
              {/* Icon Section */}
              <div className={`p-1 rounded-md shadow-sm flex-shrink-0 ${
                sortedAlerts[0].color === 'rose' 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : 'bg-amber-400 text-black'
              }`}>
                {sortedAlerts[0].icon}
              </div>

              {/* Text Content - Single Line Compact */}
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="font-black uppercase tracking-tighter text-[8px] whitespace-nowrap opacity-70">
                  {sortedAlerts[0].title}
                </p>
                <div className="w-px h-2.5 bg-current opacity-10" />
                <p className={`text-[9px] font-bold truncate ${
                  sortedAlerts[0].color === 'rose' ? 'text-white' : 'text-amber-950'
                }`}>
                  {sortedAlerts[0].message}
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  sortedAlerts[0].onDismiss();
                }}
                className={`ml-0.5 transition-colors p-0.5 rounded-full hover:bg-black/10 ${
                  sortedAlerts[0].color === 'rose' ? 'text-white/60' : 'text-black/40'
                }`}
                title="Fechar por 24h"
              >
                <X size={10} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>


  );
};