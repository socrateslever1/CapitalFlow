import React from 'react';
import { User, TrendingUp } from 'lucide-react';

export const ExtratoTopClients = ({ transactions }: { transactions: any[] }) => {
    // Group transactions by client and sum amounts
    const clientTotals = transactions.reduce((acc: any, t) => {
        if (!t.clientName) return acc;
        acc[t.clientName] = (acc[t.clientName] || 0) + t.amount;
        return acc;
    }, {});

    const topClients = Object.entries(clientTotals)
        .map(([name, amount]) => ({ name, amount: amount as number }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    if (topClients.length === 0) return null;

    return (
        <div className="space-y-4">
            {topClients.map((client, i) => (
                <div key={client.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-all">
                            <User size={14} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-white tracking-wider truncate max-w-[120px]">{client.name}</span>
                            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Top {i + 1} Contribuinte</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black text-emerald-400 tracking-tight">R$ {client.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <div className="flex items-center justify-end gap-1 text-[8px] text-emerald-500/50 font-black uppercase">
                            <TrendingUp size={8} />
                            <span>Ativo</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
