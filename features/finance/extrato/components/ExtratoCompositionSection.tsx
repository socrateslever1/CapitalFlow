import React from 'react';

export const ExtratoCompositionSection = ({ dre }: { dre: any }) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest mb-4">Composição do Resultado</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-[10px] text-slate-500 uppercase">Juros Recebidos</p><p className="text-sm font-bold text-white">R$ {dre.interestReceived.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Multas Recebidas</p><p className="text-sm font-bold text-white">R$ {dre.lateFeeReceived.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Principal Recuperado</p><p className="text-sm font-bold text-white">R$ {dre.principalRecovered.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase">Aportes</p><p className="text-sm font-bold text-rose-400">R$ {dre.investment.toFixed(2)}</p></div>
            <div className="border-t border-slate-800 pt-2"><p className="text-[10px] text-slate-500 uppercase">Resultado Operacional</p><p className="text-sm font-bold text-emerald-400">R$ {dre.netResult.toFixed(2)}</p></div>
            <div className="border-t border-slate-800 pt-2"><p className="text-[10px] text-slate-500 uppercase">Caixa Líquido</p><p className="text-sm font-bold text-white">R$ {dre.cashFlow.toFixed(2)}</p></div>
        </div>
    </div>
);
