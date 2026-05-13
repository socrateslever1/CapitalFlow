import React, { useState, useEffect } from 'react';
import { BrainCircuit, Loader2, ShieldAlert, Sparkles, RefreshCw, Target, Gauge } from 'lucide-react';
import { Loan, CapitalSource, UserProfile } from '../../types';
import { processNaturalLanguageCommand, AIResponse } from '../../services/geminiService';

export const AIBalanceInsight: React.FC<{ loans: Loan[], sources: CapitalSource[], activeUser: UserProfile | null }> = ({ loans, sources, activeUser }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AIResponse | null>(null);

    const runAudit = async () => {
        setIsAnalyzing(true);
        try {
            const caixaLivreSource = sources.find(s => {
                const n = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
            });
            const interestBalance = caixaLivreSource ? Number(caixaLivreSource.balance) : (Number(activeUser?.interestBalance) || 0);

            const context = {
                type: 'OPERATOR_AUDIT',
                isDemo: activeUser?.id === 'DEMO',
                totalLent: loans.reduce((acc, l) => acc + (l.isArchived ? 0 : l.principal), 0),
                interestBalance: interestBalance,
                lateCount: loans.filter(l => !l.isArchived && l.installments.some(i => i.status === 'LATE')).length,
                sourceLiquidity: sources.reduce((acc, s) => acc + s.balance, 0),
                portfolioHealth: loans.map(l => ({ name: l.debtorName, status: l.isArchived ? 'ARCHIVED' : 'ACTIVE' }))
            };
            const res = await processNaturalLanguageCommand("Realize um Veredito de Auditoria Técnica sobre esta carteira.", context);
            setResult(res);
        } catch (e) {
            setResult({ intent: 'ERROR', feedback: "Erro na análise técnica." });
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => { if (loans.length > 0) runAudit(); }, []);

    return (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl mt-8 group hover:border-blue-500/30 transition-all duration-500">
            <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 border-b border-slate-800 flex items-center justify-between relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-blue-500 rounded-full blur-[40px] opacity-10 group-hover:opacity-20 transition-opacity"></div>
                
                <div className="flex items-center gap-4 relative z-10">
                    <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-900/40 group-hover:scale-110 transition-transform duration-500">
                        <BrainCircuit size={20}/>
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Veredito do Auditor IA</h3>
                        <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                            <Sparkles size={10}/> Chief Risk Officer
                        </p>
                    </div>
                </div>
                <button 
                    onClick={runAudit} 
                    disabled={isAnalyzing} 
                    className="p-2.5 bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700/50 active:scale-95 relative z-10"
                >
                    {isAnalyzing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
                </button>
            </div>

            <div className="p-6 bg-slate-950/30 backdrop-blur-sm">
                {isAnalyzing && !result ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-4">
                        <div className="relative">
                            <Loader2 className="animate-spin text-blue-500" size={32}/>
                            <div className="absolute inset-0 blur-lg bg-blue-500/20 animate-pulse"></div>
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] animate-pulse">Processando Variáveis Macro...</p>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 group/item hover:border-emerald-500/30 transition-all">
                                <p className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest">Score de Saúde</p>
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${result?.riskScore && result.riskScore > 70 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                                        <Gauge size={14}/>
                                    </div>
                                    <span className="text-sm font-black text-white">{result?.riskScore || '---'}<span className="text-[10px] text-slate-500 ml-0.5">/100</span></span>
                                </div>
                            </div>
                            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 group/item hover:border-amber-500/30 transition-all">
                                <p className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-widest">Status de Risco</p>
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                                        <ShieldAlert size={14}/>
                                    </div>
                                    <span className="text-[10px] font-black text-white uppercase truncate tracking-wider">{result?.intent || 'Monitorando'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="prose prose-invert max-w-none">
                            <p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50 italic">
                                "{result?.analysis || result?.feedback || "Aguardando próxima auditoria..."}"
                            </p>
                        </div>
                        {result?.suggestions && result.suggestions.length > 0 && (
                            <div className="mt-6 flex flex-wrap gap-2">
                                {result.suggestions.map((s, i) => (
                                    <span key={i} className="text-[9px] bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-full border border-blue-500/20 font-black uppercase tracking-widest hover:bg-blue-500/20 transition-colors cursor-default">{s}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex justify-center">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">Soberania Analítica • v5.0</p>
            </div>
        </div>
    );
};
