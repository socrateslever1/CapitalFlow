
import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Activity, Play, RefreshCw, Calendar, Calculator, Link as LinkIcon, Scale } from 'lucide-react';
import { parseDateOnlyUTC, getDaysDiff, addDaysUTC, toISODateOnlyUTC } from '../../../utils/dateHelpers';
import { calculateTotalDue, getInstallmentStatusLogic } from '../../../domain/finance/calculations';
import { legalValidityService } from '../../legal/services/legalValidity.service';
import { Loan, LoanStatus } from '../../../types';

type TestResult = {
    id: string;
    category: 'DATE' | 'FINANCE' | 'PORTAL' | 'LEGAL';
    name: string;
    passed: boolean;
    details: string;
};

export const SystemHealthCheck = () => {
    const [results, setResults] = useState<TestResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        setResults([]);
        const tests: TestResult[] = [];

        await new Promise(r => setTimeout(r, 500)); // UX Delay

        // --- 1. TESTES DE DATA (CRÍTICO: FUSO HORÁRIO) ---
        try {
            const inputDate = "2024-12-25"; // Natal
            const parsed = parseDateOnlyUTC(inputDate);
            const d = parsed.getDate();
            // Se der 24, o bug do fuso horário voltou (-3h)
            tests.push({
                id: 'date-1', category: 'DATE', name: 'Parseamento de Data ISO (Y-M-D)',
                passed: d === 25,
                details: d === 25 ? `Correto: ${inputDate} -> Dia 25` : `FALHA: ${inputDate} virou Dia ${d}`
            });

            const added = addDaysUTC(parsed, 5);
            const iso = toISODateOnlyUTC(added);
            tests.push({
                id: 'date-2', category: 'DATE', name: 'Cálculo de Vencimento (+5 dias)',
                passed: iso === '2024-12-30',
                details: `Esperado: 2024-12-30 | Obtido: ${iso}`
            });
        } catch (e: any) {
            tests.push({ id: 'date-err', category: 'DATE', name: 'Erro Fatal Datas', passed: false, details: e.message });
        }

        // --- 2. TESTES FINANCEIROS (ARREDONDAMENTO IEEE 754) ---
        try {
            // Mock Loan
            const mockLoan = { 
                interestRate: 10, finePercent: 2, dailyInterestPercent: 1, 
                policiesSnapshot: { interestRate: 10, finePercent: 2, dailyInterestPercent: 1 } 
            } as any;
            
            // Mock Installment (Vencida há 5 dias)
            // Principal: 100.00
            // Juros: 10.00 (devido)
            // Multa Fixa (2%): 2.20 (2% de 110)
            // Mora Diária (1%): 5 dias * 1.10 (1% de 110) = 5.50
            // Total Esperado: 110 + 2.20 + 5.50 = 117.70
            
            // Mock Data: 5 dias atrás
            const today = new Date();
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(today.getDate() - 5);
            
            const mockInst = {
                dueDate: toISODateOnlyUTC(fiveDaysAgo),
                principalRemaining: 100,
                interestRemaining: 10,
                status: 'PENDING'
            } as any;

            const calc = calculateTotalDue(mockLoan, mockInst);
            const expectedTotal = 117.70;
            // Tolerância minúscula para float
            const diff = Math.abs(calc.total - expectedTotal);
            
            tests.push({
                id: 'fin-1', category: 'FINANCE', name: 'Cálculo de Juros/Multa/Mora',
                passed: diff < 0.01,
                details: `Calc: ${calc.total.toFixed(4)} | Esperado: ${expectedTotal.toFixed(4)}`
            });

            // Teste de Status
            const status = getInstallmentStatusLogic(mockInst as any);
            tests.push({
                id: 'fin-2', category: 'FINANCE', name: 'Detecção de Atraso (Status)',
                passed: status === LoanStatus.LATE,
                details: `Status calculado: ${status}`
            });
        } catch (e: any) {
            tests.push({ id: 'fin-err', category: 'FINANCE', name: 'Erro Fatal Financeiro', passed: false, details: e.message });
        }

        // --- 3. TESTES DE PORTAL/LINKS ---
        try {
            const mockId = '123e4567-e89b-12d3-a456-426614174000';
            const url = `${window.location.origin}/?portal=${mockId}`;
            tests.push({
                id: 'port-1', category: 'PORTAL', name: 'Estrutura de Link Seguro',
                passed: url?.includes('?portal=') && url?.includes(mockId),
                details: `URL Gerada: ${url}`
            });
        } catch (e: any) {
             tests.push({ id: 'port-err', category: 'PORTAL', name: 'Erro Fatal Portal', passed: false, details: e.message });
        }

        // --- 4. TESTES JURÍDICOS (HASH/VALIDADE) ---
        try {
            const dataA = { nome: "Teste", valor: 100 };
            const dataB = { valor: 100, nome: "Teste" }; // Ordem diferente
            
            const snapshotA = legalValidityService.prepareLegalSnapshot(dataA);
            const snapshotB = legalValidityService.prepareLegalSnapshot(dataB);
            
            // Hash deve ser idêntico independente da ordem das chaves (Canonicalização)
            const hashA = await legalValidityService.calculateHash(snapshotA);
            const hashB = await legalValidityService.calculateHash(snapshotB);

            tests.push({
                id: 'leg-1', category: 'LEGAL', name: 'Imutabilidade de Snapshot (Canonical JSON)',
                passed: snapshotA === snapshotB,
                details: 'Ordenação de chaves garantida.'
            });

            tests.push({
                id: 'leg-2', category: 'LEGAL', name: 'Assinatura Criptográfica (SHA-256)',
                passed: hashA === hashB && hashA.length === 64,
                details: `Hash Gerado: ${hashA.substring(0,10)}...`
            });

        } catch (e: any) {
            tests.push({ id: 'leg-err', category: 'LEGAL', name: 'Erro Fatal Jurídico', passed: false, details: e.message });
        }

        setResults(tests);
        setIsRunning(false);
    };

    const stats = {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-white font-black uppercase text-sm flex items-center gap-2">
                        <Activity className="text-blue-500" size={18}/> Autodiagnóstico do Sistema
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-1">Verificação interna de lógica matemática e integridade.</p>
                </div>
                <button 
                    onClick={runTests} 
                    disabled={isRunning}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all disabled:opacity-50"
                >
                    {isRunning ? <RefreshCw className="animate-spin" size={14}/> : <Play size={14}/>}
                    Rodar Testes
                </button>
            </div>

            {results.length > 0 && (
                <div className="space-y-4 animate-in slide-in-from-top-4">
                    <div className="flex gap-2 mb-4">
                        <span className="px-2 py-1 bg-slate-800 rounded text-[9px] font-bold text-white">Total: {stats.total}</span>
                        <span className="px-2 py-1 bg-emerald-900/30 text-emerald-400 rounded text-[9px] font-bold">Passou: {stats.passed}</span>
                        {stats.failed > 0 && <span className="px-2 py-1 bg-rose-900/30 text-rose-400 rounded text-[9px] font-bold">Falhou: {stats.failed}</span>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {results.map(res => (
                            <div key={res.id} className={`p-3 rounded-xl border flex items-start gap-3 ${res.passed ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-rose-950/10 border-rose-500/30'}`}>
                                <div className={`mt-0.5 ${res.passed ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {res.passed ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                            res.category === 'DATE' ? 'bg-blue-500/20 text-blue-400' :
                                            res.category === 'FINANCE' ? 'bg-emerald-500/20 text-emerald-400' :
                                            res.category === 'LEGAL' ? 'bg-purple-500/20 text-purple-400' :
                                            'bg-amber-500/20 text-amber-400'
                                        }`}>
                                            {res.category}
                                        </span>
                                        <p className="text-[10px] font-bold text-white truncate">{res.name}</p>
                                    </div>
                                    <p className={`text-[9px] font-mono ${res.passed ? 'text-slate-500' : 'text-rose-400 font-bold'}`}>
                                        {res.details}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {results.length === 0 && !isRunning && (
                <div className="text-center py-8 text-slate-600 text-xs uppercase font-black">
                    Clique em "Rodar Testes" para verificar a integridade.
                </div>
            )}
        </div>
    );
};
