
// Add missing React import to fix "Cannot find namespace 'React'" error
import React, { useState, useEffect, useMemo } from 'react';
import { Mic, Loader2, X, BrainCircuit, CheckCircle2, TrendingUp, ShieldAlert, BarChart3, Play } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { startDictation } from '../../utils/speech';
import { processNaturalLanguageCommand } from '../../services/geminiService';
import { Loan, CapitalSource } from '../../types';
import { getDaysDiff, calculateTotalDue } from '../../domain/finance/calculations';

interface AIAssistantModalProps {
    onClose: () => void;
    onCommandDetected: (result: any) => void;
    loans: Loan[];
    sources: CapitalSource[];
    activeUser: any;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ onClose, onCommandDetected, loans, sources, activeUser }) => {
    const [status, setStatus] = useState<'IDLE' | 'LISTENING' | 'THINKING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [transcript, setTranscript] = useState('');
    const [feedback, setFeedback] = useState('');
    const [strategicAnalysis, setStrategicAnalysis] = useState<string | null>(null);

    // Calcula sumário da carteira para a IA enriquecido com Fluxo Mensal
    const portfolioSummary = useMemo(() => {
        const activeLoans = loans.filter(l => !l.isArchived);
        const lateLoans = activeLoans.filter(l => l.installments.some(i => getDaysDiff(i.dueDate) > 0 && i.status !== 'PAID'));
        
        const topLate = lateLoans
            .map(l => {
                const pending = l.installments.find(i => i.status !== 'PAID');
                const debt = pending ? calculateTotalDue(l, pending) : { total: 0, daysLate: 0 };
                return { name: l.debtorName, amount: debt.total, days: debt.daysLate };
            })
            .sort((a,b) => b.amount - a.amount)
            .slice(0, 3);

        const totalLent = activeLoans.reduce((acc, l) => acc + l.principal, 0);

        // Cálculo de Fluxo do Mês (DRE Simplificado)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        let monthIn = 0;
        let monthOut = 0;

        loans.forEach(l => {
            (l.ledger || []).forEach(t => {
                if (new Date(t.date).getTime() >= startOfMonth) {
                    if (t.type === 'LEND_MORE') monthOut += t.amount;
                    else if (t.type?.includes('PAYMENT')) monthIn += t.amount;
                }
            });
        });

        return {
            totalLent,
            interestBalance: activeUser?.interestBalance || 0,
            lateCount: lateLoans.length,
            topLateLoans: topLate,
            monthFlow: { in: monthIn, out: monthOut } // Injetando dado solicitado pelo geminiService
        };
    }, [loans, activeUser]);

    // CORREÇÃO: Não inicia o microfone automaticamente para evitar bloqueio de segurança do navegador.
    // O usuário deve clicar para iniciar.

    const handleStartListening = () => {
        setStatus('LISTENING');
        setTranscript('');
        setFeedback('');
        setStrategicAnalysis(null);
        
        startDictation(
            (text) => {
                setTranscript(text);
                processCommand(text);
            },
            (err) => {
                setFeedback(err);
                setStatus('ERROR');
            }
        );
    };

    const processCommand = async (text: string) => {
        setStatus('THINKING');
        try {
            const result = await processNaturalLanguageCommand(text, portfolioSummary);
            
            if (result.intent === 'UNKNOWN') {
                setFeedback("Ainda estou aprendendo. Tente algo como 'Cadastrar cliente...' ou 'Como está minha carteira?'");
                setStatus('ERROR');
            } else if (result.intent === 'ERROR') {
                setFeedback(result.feedback);
                setStatus('ERROR');
            } else {
                setFeedback(result.feedback);
                if (result.analysis) setStrategicAnalysis(result.analysis);
                
                setStatus('SUCCESS');
                
                // Se for comando de execução (cadastro/pagamento), emite o evento
                if (result.intent !== 'ANALYZE_PORTFOLIO') {
                    setTimeout(() => {
                        onCommandDetected(result);
                        onClose();
                    }, 2000);
                }
            }
        } catch (e) {
            setFeedback("Tive um problema na rede neural. Tente novamente.");
            setStatus('ERROR');
        }
    };

    return (
        <Modal onClose={onClose} title="CFO Virtual (IA)">
            <div className="flex flex-col items-center justify-center py-6 space-y-6">
                
                {/* Visual Brain Animation */}
                <div className={`relative w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-700 rotate-45 
                    ${status === 'LISTENING' ? 'bg-blue-600 animate-pulse shadow-[0_0_40px_rgba(37,99,235,0.4)]' : 
                      status === 'THINKING' ? 'bg-purple-600 animate-spin scale-110' : 
                      status === 'SUCCESS' ? 'bg-emerald-500 rotate-0' : 'bg-slate-800'}`
                }>
                    <div className="-rotate-45">
                        {status === 'LISTENING' && <Mic size={40} className="text-white"/>}
                        {status === 'THINKING' && <BrainCircuit size={40} className="text-white"/>}
                        {status === 'SUCCESS' && <CheckCircle2 size={40} className="text-white"/>}
                        {status === 'ERROR' && <X size={40} className="text-white rotate-45"/>}
                        {status === 'IDLE' && <Mic size={40} className="text-slate-600"/>}
                    </div>
                </div>

                <div className="text-center space-y-3 px-2 w-full">
                    <p className="text-xl font-black uppercase text-white tracking-tighter">
                        {status === 'LISTENING' ? 'Estou Ouvindo...' : 
                         status === 'THINKING' ? 'Analisando Carteira...' : 
                         status === 'SUCCESS' ? 'Insight Gerado' : 
                         status === 'IDLE' ? 'Clique para Falar' : 'Aguardando'}
                    </p>
                    
                    {transcript && (
                        <p className="text-sm text-slate-500 italic max-w-xs mx-auto">"{transcript}"</p>
                    )}
                    
                    {feedback && (
                        <div className={`p-4 rounded-2xl border ${status === 'ERROR' ? 'bg-rose-950/30 border-rose-500/30 text-rose-400' : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'} font-bold text-sm leading-tight`}>
                            {feedback}
                        </div>
                    )}

                    {strategicAnalysis && (
                        <div className="mt-4 text-left bg-slate-950 border border-slate-800 p-5 rounded-2xl animate-in slide-in-from-bottom-4">
                            <div className="flex items-center gap-2 mb-3">
                                <BarChart3 size={16} className="text-blue-500"/>
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Análise Estratégica</span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                {strategicAnalysis}
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="p-2 bg-slate-900 rounded-full border border-slate-800">
                                    <p className="text-[8px] text-slate-500 uppercase font-black">Capital</p>
                                    <p className="text-xs font-bold text-white">R$ {portfolioSummary.totalLent.toLocaleString()}</p>
                                </div>
                                <div className="p-2 bg-slate-900 rounded-full border border-slate-800">
                                    <p className="text-[8px] text-slate-500 uppercase font-black">Atrasos</p>
                                    <p className="text-xs font-bold text-rose-500">{portfolioSummary.lateCount} contratos</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 w-full">
                    {status === 'IDLE' || status === 'ERROR' || strategicAnalysis ? (
                        <button onClick={handleStartListening} className="flex-1 py-5 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                            {strategicAnalysis ? <><Mic size={16}/> Nova Consulta</> : status === 'IDLE' ? <><Play size={16} className="fill-white"/> Iniciar Microfone</> : 'Tentar Novamente'}
                        </button>
                    ) : null}
                    
                    {strategicAnalysis && (
                        <button onClick={onClose} className="flex-1 py-5 bg-slate-800 text-white rounded-full text-[10px] font-black uppercase transition-all">
                            Entendido
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};
