import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { CapitalSource, Loan } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

export const DashboardAlerts = ({ loans: _loans, sources }: { loans: Loan[]; sources?: CapitalSource[] }) => {
  const lowBalanceSources = (sources || []).filter((source) => (Number(source.balance) || 0) < 100);

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

  const message = lowBalanceSources.length === 1
    ? `A fonte "${lowBalanceSources[0].name}" esta quase zerada.`
    : `${lowBalanceSources.length} fontes estao com saldo critico (< R$ 100).`;

  return (
    <div className="relative h-8 mb-3 mt-0.5 flex justify-center sm:justify-start">
      <AnimatePresence mode="popLayout">
        <motion.div
          key="balance"
          initial={{ y: 5, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ x: 30, opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(event, { offset, velocity }) => {
            if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 400) {
              handleDismissBalance();
            }
          }}
          className="cursor-grab active:cursor-grabbing max-w-full"
        >
          <div className="relative p-1 px-2.5 rounded-lg flex items-center gap-2 border shadow-sm transition-colors duration-300 bg-amber-500/80 backdrop-blur-md border-amber-400/50 text-black shadow-amber-900/10">
            <div className="p-1 rounded-md shadow-sm flex-shrink-0 bg-amber-400 text-black">
              <AlertTriangle size={14} />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-black uppercase tracking-tighter text-[8px] whitespace-nowrap opacity-70">
                Saldo Baixo
              </p>
              <div className="w-px h-2.5 bg-current opacity-10" />
              <p className="text-[9px] font-bold truncate text-amber-950">
                {message}
              </p>
            </div>

            <button
              onClick={(event) => {
                event.stopPropagation();
                handleDismissBalance();
              }}
              className="ml-0.5 transition-colors p-0.5 rounded-full hover:bg-black/10 text-black/40"
              title="Fechar por 24h"
            >
              <X size={10} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
