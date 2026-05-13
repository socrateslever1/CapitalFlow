
import React from 'react';
import { FileSignature, ChevronRight } from 'lucide-react';

interface PortalActionsProps {
    onOpenLegal: () => void;
}

export const PortalActions: React.FC<PortalActionsProps> = ({ onOpenLegal }) => {
    return (
        <button onClick={onOpenLegal} className="w-full bg-slate-800 border border-slate-700 p-4 rounded-2xl flex items-center justify-between group hover:bg-slate-700 transition-all">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all">
                    <FileSignature size={18}/>
                </div>
                <div className="text-left">
                    <p className="text-xs font-bold text-white uppercase">Meus Documentos</p>
                    <p className="text-[10px] text-slate-500">Visualizar contratos e termos</p>
                </div>
            </div>
            <ChevronRight size={16} className="text-slate-500"/>
        </button>
    );
};
