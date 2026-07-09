import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Lightbulb, Loader2, BookOpen, HeartPulse, RefreshCw, Trophy } from 'lucide-react';
import { processNaturalLanguageCommand, AIResponse } from '../../../services/geminiService';
import { Loan } from '../../../types';
import { isGeminiConfigError } from '../../../utils/geminiConfig';
import { resolveDebtSummary } from '../mappers/portalDebtRules';

const formatCurrency = (value: number) =>
    Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const formatDate = (date: Date | null) =>
    date
        ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

const buildEducationalFallback = (contracts: Loan[], clientName: string): AIResponse => {
    const summaries = contracts.map((contract) => resolveDebtSummary(contract, contract.installments || []));
    const totalDebt = summaries.reduce((acc, item) => acc + item.totalDue, 0);
    const pendingCount = summaries.reduce((acc, item) => acc + item.pendingCount, 0);
    const lateContracts = summaries.filter((item) => item.hasLateInstallments);
    const maxDaysLate = Math.max(0, ...summaries.map((item) => item.maxDaysLate || 0));
    const nextDueDate = summaries
        .map((item) => item.nextDueDate)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    const shortName = clientName?.split(' ')?.[0] || 'cliente';
    const hasMultipleContracts = contracts.length > 1;
    const baseDebt = totalDebt > 0 ? `Seu saldo em aberto no portal é de ${formatCurrency(totalDebt)}` : 'Seu portal não mostra saldo pendente neste momento';

    if (lateContracts.length > 0) {
        return {
            intent: 'FALLBACK_CONTEXTUAL',
            feedback: `${baseDebt}, com ${lateContracts.length} contrato${lateContracts.length === 1 ? '' : 's'} em atraso.`,
            analysis: `${shortName}, ${baseDebt}, com atraso de até ${maxDaysLate} dia${maxDaysLate === 1 ? '' : 's'}. O melhor caminho agora é priorizar a regularização das parcelas vencidas e abrir conversa antes que o valor cresça com encargos. Se não conseguir quitar tudo, proponha um pagamento inicial realista e combine uma data possível para o restante.`,
            suggestions: ['Priorize o vencido', 'Combine uma data real', 'Evite novo atraso'],
        };
    }

    if (pendingCount > 0 && nextDueDate) {
        const daysUntilDue = Math.ceil((nextDueDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
        const duePhrase = daysUntilDue <= 0
            ? 'com vencimento hoje'
            : `com próximo vencimento em ${formatDate(nextDueDate)}`;

        return {
            intent: 'FALLBACK_CONTEXTUAL',
            feedback: `${baseDebt}, ${duePhrase}.`,
            analysis: `${shortName}, ${baseDebt}, distribuído em ${pendingCount} parcela${pendingCount === 1 ? '' : 's'} pendente${pendingCount === 1 ? '' : 's'}${hasMultipleContracts ? ` em ${contracts.length} contratos` : ''}. Como não há atraso crítico agora, sua melhor estratégia é se organizar antes do vencimento, separar o valor da próxima parcela e evitar renegociações de última hora.`,
            suggestions: ['Reserve a próxima parcela', 'Confira o vencimento', 'Pague antes do prazo'],
        };
    }

    return {
        intent: 'FALLBACK_CONTEXTUAL',
        feedback: 'Carteira sem pendência aberta no portal.',
        analysis: `${shortName}, sua situação no portal está organizada neste momento. Mantenha o acompanhamento dos contratos, guarde os comprovantes e use crédito somente quando a parcela couber no seu fluxo normal de entrada.`,
        suggestions: ['Mantenha comprovantes', 'Planeje novo crédito', 'Evite comprometer renda'],
    };
};

export const PortalEducationalAI: React.FC<{ contracts: Loan[], clientName: string }> = ({ contracts, clientName }) => {
    const [result, setResult] = useState<AIResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const portfolioSignature = useMemo(() => {
        return contracts.map((contract) => {
            const summary = resolveDebtSummary(contract, contract.installments || []);
            return [
                contract.id,
                summary.totalDue,
                summary.pendingCount,
                summary.maxDaysLate,
                summary.nextDueDate?.toISOString() || '',
            ].join(':');
        }).join('|');
    }, [contracts]);

    const generateMentorAdvice = async () => {
        if (contracts.length === 0) return;
        setLoading(true);
        try {
            const context = {
                type: 'PORTAL_CLIENT',
                clientName,
                debtCount: contracts.length,
                totalDebt: contracts.reduce((acc, c) => acc + resolveDebtSummary(c, c.installments || []).totalDue, 0),
                isLate: contracts.some(c => resolveDebtSummary(c, c.installments || []).hasLateInstallments),
                history: contracts.map(c => ({ start: c.startDate, principal: c.principal }))
            };
            const contextualFallback = buildEducationalFallback(contracts, clientName);
            const res = await processNaturalLanguageCommand("Gere um guia de educação e prosperidade para este cliente.", context);
            
            const isOperatorFallback = res.analysis?.includes('Leitura interna') || res.feedback?.includes('Leitura interna');
            
            if (res.intent === 'ERROR' || isOperatorFallback) {
                setResult(contextualFallback);
                return;
            }
            setResult(res);
        } catch (e) {
            setResult(buildEducationalFallback(contracts, clientName));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { generateMentorAdvice(); }, [portfolioSignature, clientName]);

    return (
        <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-pink-600 rounded-lg text-white shadow-lg shadow-pink-900/20">
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

            <div className="bg-slate-950/50 p-6 rounded-lg border border-slate-800 relative overflow-hidden group">
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

            <div className="bg-blue-600/5 p-4 rounded-lg border border-blue-500/10 text-center">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                    Educação para o Crédito Consciente
                </p>
            </div>
        </div>
    );
};
