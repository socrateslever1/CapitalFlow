
import React from 'react';
import { MessageSquare, FileEdit, Link as LinkIcon, Upload, FileText } from 'lucide-react';

interface QuickActionsProps {
    hasNotes: boolean;
    onMessage: (e: React.MouseEvent) => void;
    onNote: (e: React.MouseEvent) => void;
    onPortalLink: (e: React.MouseEvent) => void;
    onViewDoc: (e: React.MouseEvent, url: string) => void;
    onUploadPromissoria?: (e: React.MouseEvent) => void;
    onUploadDoc: (e: React.MouseEvent) => void;
    onEdit: (e: React.MouseEvent) => void;
    onNavigate: (e: React.MouseEvent) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
    hasNotes, onMessage, onNote, onPortalLink, onViewDoc, onUploadPromissoria, onUploadDoc, onEdit, onNavigate
}) => {
    return (
        <div className="grid grid-cols-3 gap-2">
             <button onClick={(e) => { e.stopPropagation(); onEdit(e); }} className="w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white rounded-xl transition-all">
                <FileEdit size={14} /> 
                <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">Editar</span>
             </button>

             <button onClick={(e) => { e.stopPropagation(); onMessage(e); }} className="w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-emerald-600/10 text-emerald-500 hover:bg-gradient-to-br hover:from-emerald-600 hover:to-emerald-700 hover:text-white rounded-xl transition-all">
                <MessageSquare size={14} /> 
                <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">WhatsApp</span>
             </button>
             
             <button onClick={(e) => { e.stopPropagation(); onPortalLink(e); }} className="w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-blue-600/10 text-blue-500 hover:bg-gradient-to-br hover:from-blue-600 hover:to-blue-700 hover:text-white rounded-xl transition-all">
                <LinkIcon size={14} /> 
                <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">Portal Link</span>
             </button>

             {onUploadPromissoria && (
                 <button onClick={(e) => { e.stopPropagation(); onUploadPromissoria(e); }} className="w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-purple-600/10 text-purple-500 hover:bg-gradient-to-br hover:from-purple-600 hover:to-purple-700 hover:text-white rounded-xl transition-all">
                    <FileText size={14} /> 
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">Promissória</span>
                 </button>
             )}

             <button onClick={(e) => { e.stopPropagation(); onUploadDoc(e); }} className="w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all">
                <Upload size={14} /> 
                <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">Anexar</span>
             </button>

             <button 
                onClick={(e) => { e.stopPropagation(); onNote(e); }} 
                className={`w-full flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl transition-all ${
                    hasNotes 
                    ? 'bg-amber-600/20 text-amber-500 hover:bg-amber-600 hover:text-white' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
             >
                <FileEdit size={14} /> 
                <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tight text-center">
                    Notas {hasNotes && '(1)'}
                </span>
             </button>
        </div>
    );
};
