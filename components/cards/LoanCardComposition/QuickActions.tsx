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
    hasNotes,
    onMessage,
    onNote,
    onPortalLink,
    onViewDoc,
    onUploadPromissoria,
    onUploadDoc,
    onEdit,
    onNavigate,
}) => {
    void onViewDoc;
    void onNavigate;

    const buttonClass =
        'w-full min-h-16 overflow-hidden rounded-lg px-2 py-2.5 transition-all flex flex-col items-center justify-center gap-1.5';
    const labelClass = 'w-full truncate text-center text-[8px] sm:text-[9px] font-black uppercase leading-tight';

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onEdit(e);
                }}
                className={`${buttonClass} bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white`}
            >
                <FileEdit size={14} />
                <span className={labelClass}>Editar</span>
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onMessage(e);
                }}
                className={`${buttonClass} bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white`}
            >
                <MessageSquare size={14} />
                <span className={labelClass}>WhatsApp · Opções</span>
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onPortalLink(e);
                }}
                className={`${buttonClass} bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white`}
            >
                <LinkIcon size={14} />
                <span className={labelClass}>Portal</span>
            </button>

            {onUploadPromissoria && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onUploadPromissoria(e);
                    }}
                    className={`${buttonClass} bg-purple-600/10 text-purple-500 hover:bg-purple-600 hover:text-white`}
                >
                    <FileText size={14} />
                    <span className={labelClass}>Promissoria</span>
                </button>
            )}

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onUploadDoc(e);
                }}
                className={`${buttonClass} bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white`}
            >
                <Upload size={14} />
                <span className={labelClass}>Anexar</span>
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onNote(e);
                }}
                className={`${buttonClass} ${hasNotes
                        ? 'bg-amber-600/20 text-amber-500 hover:bg-amber-600 hover:text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
            >
                <FileEdit size={14} />
                <span className={labelClass}>Notas {hasNotes && '(1)'}</span>
            </button>
        </div>
    );
};
