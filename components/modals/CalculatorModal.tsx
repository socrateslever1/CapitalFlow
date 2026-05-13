
import React, { useState, useEffect } from 'react';
import { Calculator, DollarSign, Calendar, Percent, RefreshCcw, TrendingUp, Clock, Play, Divide, X, Minus, Plus, Equal, ChevronLeft } from 'lucide-react';

type CalcMode = 'MONTHLY' | 'DAILY' | 'BASIC';

export const CalculatorModal = ({ onClose }: { onClose: () => void }) => {
    const [mode, setMode] = useState<CalcMode>('MONTHLY');
    const [principal, setPrincipal] = useState('');
    const [rate, setRate] = useState('');
    const [duration, setDuration] = useState('1');
    
    // Basic Calculator State
    const [calcDisplay, setCalcDisplay] = useState('0');
    const [calcMemory, setCalcMemory] = useState<number | null>(null);
    const [calcOp, setCalcOp] = useState<string | null>(null);
    const [newNumber, setNewNumber] = useState(true);

    // Resultados Simulador
    const [results, setResults] = useState<{
        grossProfit: number;
        totalReturn: number;
        profitPerPeriod: number;
        roi: number;
    } | null>(null);

    // Helper de parser seguro (Mesmo do PaymentManager)
    const safeParse = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes('.') && str.includes(',')) {
            return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        }
        if (str.includes(',')) {
            return parseFloat(str.replace(',', '.')) || 0;
        }
        return parseFloat(str) || 0;
    };

    // Função de simulação manual e automática
    const calculate = () => {
        const p = safeParse(principal);
        const r = safeParse(rate);
        const t = safeParse(duration);

        if (p > 0 && r > 0 && t > 0) {
            let grossProfit = 0;
            let profitPerPeriod = 0;

            if (mode === 'MONTHLY') {
                // Lucro Simples: Capital * (Taxa/100) * Meses
                profitPerPeriod = p * (r / 100);
                grossProfit = profitPerPeriod * t;
            } else {
                // Diário (Baseado na taxa mensal pro-rata dia)
                // Taxa Diária = Taxa Mensal / 30
                const dailyRate = (r / 100) / 30;
                profitPerPeriod = p * dailyRate; // Lucro por dia
                grossProfit = profitPerPeriod * t; // Lucro total nos dias
            }

            const totalReturn = p + grossProfit;
            const roi = (grossProfit / p) * 100;

            setResults({
                grossProfit,
                totalReturn,
                profitPerPeriod,
                roi
            });
        }
    };

    // Cálculo automático com delay suave
    useEffect(() => {
        if (mode === 'BASIC') return;
        const timer = setTimeout(calculate, 500);
        return () => clearTimeout(timer);
    }, [principal, rate, duration, mode]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Basic Calculator Logic
    const handleDigit = (digit: string) => {
        if (newNumber) {
            setCalcDisplay(digit);
            setNewNumber(false);
        } else {
            setCalcDisplay(calcDisplay === '0' ? digit : calcDisplay + digit);
        }
    };

    const handleOp = (op: string) => {
        const current = parseFloat(calcDisplay.replace(',', '.'));
        if (calcMemory === null) {
            setCalcMemory(current);
        } else if (calcOp) {
            const result = performCalc(calcMemory, current, calcOp);
            setCalcMemory(result);
            setCalcDisplay(String(result));
        }
        setCalcOp(op);
        setNewNumber(true);
    };

    const performCalc = (a: number, b: number, op: string) => {
        switch(op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return a / b;
            default: return b;
        }
    };

    const handleEqual = () => {
        if (calcOp && calcMemory !== null) {
            const current = parseFloat(calcDisplay.replace(',', '.'));
            const result = performCalc(calcMemory, current, calcOp);
            setCalcDisplay(String(result));
            setCalcMemory(null);
            setCalcOp(null);
            setNewNumber(true);
        }
    };

    const handleClear = () => {
        setCalcDisplay('0');
        setCalcMemory(null);
        setCalcOp(null);
        setNewNumber(true);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in duration-300 font-sans h-[100dvh]">
            {/* Header */}
            <div className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-900/20">
                        <Calculator size={20} />
                    </div>
                    <div>
                        <h1 className="text-sm font-black text-white uppercase tracking-wider leading-none">Ferramentas</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">
                            Simulador e Calculadora
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 custom-scrollbar">
                <div className="max-w-3xl mx-auto space-y-6">
                    
                    {/* Seletor de Modalidade */}
                <div className="flex p-1 bg-slate-950 rounded-full border border-slate-800">
                    <button 
                        onClick={() => { setMode('MONTHLY'); setDuration('1'); }} 
                        className={`flex-1 py-3 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mode === 'MONTHLY' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Calendar size={14}/> Mensal
                    </button>
                    <button 
                        onClick={() => { setMode('DAILY'); setDuration('30'); }} 
                        className={`flex-1 py-3 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mode === 'DAILY' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Clock size={14}/> Diário
                    </button>
                    <button 
                        onClick={() => setMode('BASIC')} 
                        className={`flex-1 py-3 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${mode === 'BASIC' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Calculator size={14}/> Calc
                    </button>
                </div>

                {mode === 'BASIC' ? (
                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-2xl">
                        <div className="bg-slate-900 p-4 rounded-full mb-4 text-right">
                            <span className="text-3xl font-mono text-white tracking-widest">{calcDisplay}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            <button onClick={handleClear} className="col-span-3 p-4 bg-rose-900/30 text-rose-500 rounded-full font-black hover:bg-rose-900/50 transition-colors">C</button>
                            <button onClick={() => handleOp('/')} className="p-4 bg-slate-800 text-blue-400 rounded-full font-black hover:bg-slate-700 transition-colors"><Divide size={20}/></button>
                            
                            {[7,8,9].map(d => <button key={d} onClick={() => handleDigit(String(d))} className="p-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors">{d}</button>)}
                            <button onClick={() => handleOp('*')} className="p-4 bg-slate-800 text-blue-400 rounded-full font-black hover:bg-slate-700 transition-colors"><X size={20}/></button>
                            
                            {[4,5,6].map(d => <button key={d} onClick={() => handleDigit(String(d))} className="p-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors">{d}</button>)}
                            <button onClick={() => handleOp('-')} className="p-4 bg-slate-800 text-blue-400 rounded-full font-black hover:bg-slate-700 transition-colors"><Minus size={20}/></button>
                            
                            {[1,2,3].map(d => <button key={d} onClick={() => handleDigit(String(d))} className="p-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors">{d}</button>)}
                            <button onClick={() => handleOp('+')} className="p-4 bg-slate-800 text-blue-400 rounded-full font-black hover:bg-slate-700 transition-colors"><Plus size={20}/></button>
                            
                            <button onClick={() => handleDigit('0')} className="col-span-2 p-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors">0</button>
                            <button onClick={() => handleDigit('.')} className="p-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition-colors">.</button>
                            <button onClick={handleEqual} className="p-4 bg-emerald-600 text-white rounded-full font-black hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20"><Equal size={20}/></button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Inputs Simulador */}
                        <div className="space-y-4">
                            {/* Chat Bubble: Capital */}
                            <div className="flex gap-3 items-end">
                                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 text-white shadow-lg"><DollarSign size={16}/></div>
                                <div className="bg-slate-900 p-4 rounded-2xl rounded-bl-none border border-slate-800 max-w-[85%]">
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Capital Investido</p>
                                    <input 
                                        type="text" 
                                        inputMode="decimal" 
                                        placeholder="0,00" 
                                        className="w-full bg-transparent text-white text-xl font-black outline-none placeholder:text-slate-700" 
                                        value={principal || ''} 
                                        onChange={e => setPrincipal(e.target.value.replace(/[^0-9.,]/g, ''))}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Chat Bubble: Taxa */}
                            <div className="flex gap-3 items-end flex-row-reverse">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 text-white shadow-lg"><Percent size={16}/></div>
                                <div className="bg-slate-900 p-4 rounded-2xl rounded-br-none border border-slate-800 max-w-[85%] text-right">
                                    <p className="text-[10px] font-bold text-indigo-500 uppercase mb-1">Taxa Mensal (%)</p>
                                    <input 
                                        type="text" 
                                        inputMode="decimal" 
                                        placeholder="10" 
                                        className="w-full bg-transparent text-white text-xl font-black outline-none placeholder:text-slate-700 text-right" 
                                        value={rate || ''} 
                                        onChange={e => setRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                                    />
                                </div>
                            </div>

                            {/* Chat Bubble: Prazo */}
                            <div className="flex gap-3 items-end">
                                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 text-white shadow-lg"><Clock size={16}/></div>
                                <div className="bg-slate-900 p-4 rounded-2xl rounded-bl-none border border-slate-800 max-w-[85%]">
                                    <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">{mode === 'MONTHLY' ? 'Prazo (Meses)' : 'Prazo (Dias)'}</p>
                                    <input 
                                        type="text" 
                                        inputMode="decimal" 
                                        placeholder={mode === 'MONTHLY' ? "1" : "30"} 
                                        className="w-full bg-transparent text-white text-xl font-black outline-none placeholder:text-slate-700" 
                                        value={duration || ''} 
                                        onChange={e => setDuration(e.target.value.replace(/[^0-9.,]/g, ''))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Resultados */}
                        {results && (
                            <div className="mt-6 space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-center">
                                    <div className="bg-emerald-600/20 text-emerald-400 px-4 py-1 rounded-full text-[10px] font-black uppercase border border-emerald-500/30">
                                        Resultado da Simulação
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 rounded-2xl relative overflow-hidden shadow-2xl">
                                    <div className="flex flex-col items-center text-center">
                                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Retorno Total (Juros)</span>
                                        <span className="text-4xl font-black text-white tracking-tight">{formatCurrency(results.grossProfit)}</span>
                                        <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                                            <TrendingUp size={14}/>
                                            <span>ROI: +{results.roi.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-800/50">
                                        <div className="text-center">
                                            <p className="text-[9px] font-black uppercase text-slate-500">Por {mode === 'MONTHLY' ? 'Mês' : 'Dia'}</p>
                                            <p className="text-sm font-bold text-white mt-1">{formatCurrency(results.profitPerPeriod)}</p>
                                        </div>
                                        <div className="text-center border-l border-slate-800/50">
                                            <p className="text-[9px] font-black uppercase text-slate-500">Montante Final</p>
                                            <p className="text-sm font-bold text-blue-400 mt-1">{formatCurrency(results.totalReturn)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
                </div>
            </div>
        </div>
    );
};
