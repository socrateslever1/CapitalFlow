import React, { useState, useEffect } from 'react';
import { BrainCircuit, Loader2, Sparkles, TrendingUp, Users, Target } from 'lucide-react';
import { processNaturalLanguageCommand } from '../../../services/geminiService';

export const TeamAIInsight: React.FC<{ members: any[], teamName?: string }> = ({ members, teamName }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [insight, setInsight] = useState<any>(null);

    const runAnalysis = async () => {
        if (members.length === 0) return;
        setIsAnalyzing(true);
        try {
            const context = {
                type: 'TEAM_PAGE',
                teamName: teamName || 'Equipe Principal',
                memberCount: members.length,
                members: members.map(m => ({
                    name: m.full_name,
                    role: m.role,
                    logins: m.linked_profile?.access_count || 0,
                    lastActive: m.linked_profile?.last_active_at,
                    status: m.invite_status
                }))
            };
            const res = await processNaturalLanguageCommand("Analise o engajamento operacional e a saúde estrutural desta equipe.", context);
            setInsight(res);
        } catch (e) {
            setInsight({ feedback: "Erro ao analisar equipe. Verifique a conexão com o banco." });
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => { runAnalysis(); }, [members.length]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-500 flex items-center justify-center shrink-0">
                    <BrainCircuit size={20}/>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-white uppercase leading-none">Visão do <span className="text-blue-500">Líder IA</span></h3>
                    <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">
                        Team Performance Analytics
                    </p>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/5 blur-[50px] rounded-full pointer-events-none"></div>
                
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    {isAnalyzing ? (
                        <div className="py-8 flex flex-col items-center justify-center gap-2">
                            <Loader2 className="animate-spin text-blue-500" size={20}/>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Auditando Operadores...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-indigo-400 mb-1">
                                <Target size={14}/>
                                <span className="text-[10px] font-black uppercase">Diagnóstico Gerencial</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                {insight?.analysis || insight?.feedback || "Selecione uma equipe para análise de produtividade."}
                            </p>
                            
                            {insight?.suggestions && (
                                <div className="pt-4 border-t border-slate-800">
                                    <p className="text-[10px] font-black text-blue-500 uppercase mb-2">Recomendações de Gestão:</p>
                                    <ul className="space-y-2">
                                        {insight.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="text-[10px] text-slate-400 flex items-start gap-2">
                                                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5"></div>
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex items-center justify-between text-[8px] font-black text-slate-600 uppercase tracking-widest">
                    <span>Relatório Auditado por IA</span>
                    <span>v3.5 Strategic</span>
                </div>
            </div>
        </div>
    );
};