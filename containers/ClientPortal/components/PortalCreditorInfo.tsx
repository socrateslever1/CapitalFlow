
import React from 'react';
import { Building } from 'lucide-react';

interface PortalCreditorInfoProps {
    creditorName: string;
}

export const PortalCreditorInfo: React.FC<PortalCreditorInfoProps> = ({ creditorName }) => {
    return (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50 flex items-center gap-3 opacity-60">
            <div className="p-2 bg-slate-800 rounded-xl text-slate-400"><Building size={16}/></div>
            <div className="overflow-hidden flex-1">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Credor Responsável</p>
                <p className="text-[10px] text-white font-bold truncate">{creditorName}</p>
            </div>
        </div>
    );
};
