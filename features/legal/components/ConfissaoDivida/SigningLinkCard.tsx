/**
 * Componente SigningLinkCard.
 * Responsável por renderizar o card de atalho para links de assinatura,
 * exibindo o papel do assinante (devedor, credor, testemunhas), seu nome,
 * a URL truncada e botões de ação rápida para copiar, abrir e enviar via WhatsApp.
 */

import React from 'react';
import { Copy, ExternalLink, Send } from 'lucide-react';

interface SigningLinkCardProps {
    title: string;
    subtitle?: string;
    url: string;
    onCopy: () => void;
    onWhatsApp?: () => void;
    color: 'indigo' | 'emerald' | 'slate';
}

export const SigningLinkCard: React.FC<SigningLinkCardProps> = ({
    title,
    subtitle,
    url,
    onCopy,
    onWhatsApp,
    color
}) => {
    const colorClasses = {
        indigo: 'border-indigo-500/10 bg-indigo-500/5 text-indigo-400 hover:border-indigo-500/30',
        emerald: 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/30',
        slate: 'border-slate-500/10 bg-slate-500/5 text-slate-400 hover:border-slate-500/30',
    };

    return (
        <div className={`p-4 rounded-lg border transition-all group ${colorClasses[color]}`}>
            <div className="flex justify-between items-center mb-3">
                <div>
                    <h5 className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-0.5">{title}</h5>
                    <p className="text-[10px] font-black uppercase text-white truncate max-w-[140px]">{subtitle || '...'}</p>
                </div>
                <div className="flex gap-1.5">
                    {onWhatsApp && (
                        <button
                            onClick={onWhatsApp}
                            className="p-1.5 hover:bg-emerald-500/20 rounded-md transition-colors text-emerald-500"
                            title="Enviar via WhatsApp"
                        >
                            <Send size={12} />
                        </button>
                    )}
                    <button onClick={onCopy} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title="Copiar Link">
                        <Copy size={12} />
                    </button>
                    <button
                        onClick={() => window.open(url, '_blank')}
                        className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                        title="Abrir"
                    >
                        <ExternalLink size={12} />
                    </button>
                </div>
            </div>
            <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <p className="text-[8px] font-mono truncate opacity-30 select-all">{url}</p>
            </div>
        </div>
    );
};
