
import React from 'react';
import { LogOut, ChevronDown, Lock } from 'lucide-react';

interface PortalHeaderProps {
    loggedClient: any;
    selectedLoanId: string;
    setSelectedLoanId: (id: string) => void;
    clientContracts: any[];
    handleLogout: () => void;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({ 
    loggedClient, selectedLoanId, setSelectedLoanId, clientContracts, handleLogout 
}) => {
    return (
        <div className="bg-slate-950 border-b border-slate-800 shrink-0 relative z-20">
            <div className="p-5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg">
                        {loggedClient.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bem-vindo(a)</p>
                        <p className="text-white font-bold text-sm truncate max-w-[150px]">{loggedClient.name.split(' ')[0]}</p>
                    </div>
                </div>
                <button onClick={handleLogout} className="p-2.5 bg-slate-900 text-slate-500 border border-slate-800 rounded-xl hover:text-rose-500 hover:border-rose-500/30 transition-colors">
                    <LogOut size={16}/>
                </button>
            </div>

            {/* CONTRATO SWITCHER */}
            <div className="px-5 pb-5">
                <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2 block ml-1">Contrato Selecionado</label>
                <div className="relative group">
                    <select 
                        value={selectedLoanId}
                        onChange={(e) => setSelectedLoanId(e.target.value)}
                        className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-xl pl-4 pr-10 py-3 text-white text-xs font-bold uppercase outline-none focus:border-blue-500 appearance-none cursor-pointer hover:bg-slate-800 transition-colors shadow-sm"
                        disabled={clientContracts.length <= 1}
                    >
                        {clientContracts.map((c) => {
                            const dateStr = new Date(c.start_date || c.created_at).toLocaleDateString('pt-BR');
                            const label = c.code ? `CONTRATO #${c.code}` : `CONTRATO ...${c.id.substring(0, 6).toUpperCase()}`;
                            return (
                                <option key={c.id} value={c.id}>
                                    {label} | Início: {dateStr}
                                </option>
                            );
                        })}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                        {clientContracts.length > 1 ? <ChevronDown size={16} /> : <Lock size={14} className="opacity-50"/>}
                    </div>
                </div>
            </div>
        </div>
    );
};
