import React, { useState, useEffect } from 'react';
import { BrainCircuit, Sparkles, RefreshCw, Lightbulb, Loader2 } from 'lucide-react';
import { processNaturalLanguageCommand, AIResponse } from '../../../services/geminiService';
import { PFTransaction, PFAccount, PFCard } from '../types';

interface Props {
    transactions: PFTransaction[];
    accounts: PFAccount[];
    cards: PFCard[];
    profileId: string;
    onRefresh: () => void;
}

export const PersonalFinanceAI: React.FC<Props> = ({ transactions, accounts, cards, profileId }) => {
    const [result, setResult] = useState<AIResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const generateInsight = async () => {
        setLoading(true);
        try {
            const context = {
                type: 'PERSONAL_FINANCE',
                isDemo: profileId === 'DEMO',
                balance: accounts.reduce((acc, a) => acc + (Number(a.saldo) || 0), 0),
                totalExpensesMonth: transactions.filter(t => t.tipo === 'DESPESA').reduce((acc, t) => acc + t.valor, 0),
                accounts: accounts.map(a => ({ name: a.nome, type: a.tipo, balance: a.saldo })),
                cards: cards.map(c => ({ name: c.nome, limit: c.limite })),
                recentActivity: transactions.slice(0, 5).map(t => ({ desc: t.descricao, val: t.valor, type: t.tipo }))
            };

            const res = await processNaturalLanguageCommand("Realize uma consultoria CFO Pessoal sobre minha saúde financeira atual.", context);
            setResult(res);
        } catch (e) {
            setResult({ intent: 'ERROR', feedback: "Não foi possível gerar a consultoria agora." });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (transactions.length > 0 || accounts.length > 0) {
            generateInsight();
        }
    }, [transactions.length, accounts.length]);

    return (
        <div className="w-full bg-gradient-to-r from-slate-900 to-slate-900 border border-pink-500/30 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl mt-8">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-pink-600/10 blur-[80px] rounded-full pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-pink-600 rounded-2xl text-white shadow-lg shadow-pink-600/20">
                        <BrainCircuit size={28}/>
                    </div>
                    <div>
                        <h3 className="text-white font-black uppercase text-lg tracking-tight">Consultor Pessoal AI</h3>
                        <p className="text-[10px] text-pink-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <Sparkles size={12}/> Planejamento Patrimonial
                        </p>
                    </div>
                </div>

                <button 
                    onClick={generateInsight}
                    disabled={loading}
                    className="p-3 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
                >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800 relative z-10">
                {loading ? (
                    <div className="flex items-center gap-3 text-slate-500 py-4">
                        <Loader2 size={18} className="animate-spin text-pink-500"/>
                        <span className="text-xs font-bold uppercase tracking-widest">Avaliando fluxos de caixa...</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <Lightbulb size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                                {result?.analysis || result?.feedback || "Aguardando movimentações para análise estratégica."}
                            </div>
                        </div>
                        {result?.suggestions && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {result.suggestions.map((s, i) => (
                                    <span key={i} className="text-[8px] bg-pink-500/10 text-pink-400 px-2 py-1 rounded-md border border-pink-500/20 font-black uppercase">{s}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};