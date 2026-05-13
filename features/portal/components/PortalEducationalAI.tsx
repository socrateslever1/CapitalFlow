import React, { useState, useEffect } from 'react';
import { Sparkles, Lightbulb, Loader2, BookOpen, HeartPulse, RefreshCw, Trophy } from 'lucide-react';
import { processNaturalLanguageCommand, AIResponse } from '../../../services/geminiService';
import { Loan } from '../../../types';

export const PortalEducationalAI: React.FC<{ contracts: Loan[], clientName: string }> = ({ contracts, clientName }) => {
    const [result, setResult] = useState<AIResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const generateMentorAdvice = async () => {
        if (contracts.length === 0) return;
        setLoading(true);
        try {
            const context = {
                type: 'PORTAL_CLIENT',
                clientName,
                debtCount: contracts.length,
                totalDebt: contracts.reduce((acc, c) => acc + (Number(c.totalToReceive) || 0), 0),
                isLate: contracts.some(c => c.installments.some(i => i.status === 'LATE')),
                history: contracts.map(c => ({ start: c.startDate, principal: c.principal }))
            };
            const res = await processNaturalLanguageCommand("Gere um guia de educação e prosperidade para este cliente.", context);
            setResult(res);
        } catch (e) {
            setResult({ intent: 'ERROR', feedback: "Olá! Queria te dar umas dicas de finanças, mas meu sistema está em manutenção rápida. Tente em instantes!" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { generateMentorAdvice(); }, [contracts.length]);

    return (
        <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-pink-600 rounded-xl text-white shadow-lg shadow-pink-900/20">
                        <HeartPulse size={20}/>
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase text-xs tracking-tighter">Caminho da Prosperidade</h3>
                        <p className="text-[10px] text-pink-500 font-black uppercase flex items-center gap-1">
                            <Sparkles size={10}/> Mentor de Futuro
                        </p>
                    </div>
                </div>
                <button onClick={generateMentorAdvice} disabled={loading} className="p-2 text-slate-500 hover:text-white transition-colors">
                    {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
                </button>
            </div>

            <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Trophy size={64} className="text-white"/>
                </div>
                
                {loading && !result ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="animate-spin text-pink-500" size={24}/>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Traçando seu Perfil...</p>
                    </div>
                ) : (
                    <div className="space-y-4 relative z-10">
                        <div className="flex items-center gap-2 text-yellow-500 font-black text-[10px] uppercase tracking-widest">
                            <Lightbulb size={14}/> Insight Educacional
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium italic">
                            "{result?.analysis || result?.feedback || "Sua saúde financeira começa com a organização de hoje."}"
                        </p>
                        {result?.suggestions && (
                             <div className="flex flex-wrap gap-2 pt-2">
                                {result.suggestions.slice(0, 3).map((s, i) => (
                                    <span key={i} className="text-[8px] bg-slate-900 text-slate-400 px-2 py-1 rounded-full border border-slate-800 font-bold">{s}</span>
                                ))}
                             </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-blue-600/5 p-4 rounded-2xl border border-blue-500/10 text-center">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                    Educação para o Crédito Consciente
                </p>
            </div>
        </div>
    );
};