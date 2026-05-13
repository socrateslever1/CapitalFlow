
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Wallet, CreditCard, TrendingUp, TrendingDown, LayoutGrid, ArrowRightLeft, ShoppingBag, Settings2, Calendar, Banknote, Coins, ChevronLeft, ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock, CreditCard as CardIcon, Layers } from 'lucide-react';
import { UserProfile } from '../types';
import { personalFinanceService } from '../features/personal-finance/services/personalFinanceService';
import { PFTransaction, PFAccount, PFCard, PFCategory } from '../features/personal-finance/types';
import { formatMoney } from '../utils/formatters';
import { Modal } from '../components/ui/Modal';

interface Props {
    activeUser: UserProfile;
    setActiveTab?: (tab: string) => void;
    loans?: any[];
    goBack?: () => void;
}

export const PersonalFinancesPage: React.FC<Props> = ({ activeUser, setActiveTab, loans = [], goBack }) => {
    const [transactions, setTransactions] = useState<PFTransaction[]>([]);
    const [accounts, setAccounts] = useState<PFAccount[]>([]);
    const [cards, setCards] = useState<PFCard[]>([]);
    const [categories, setCategories] = useState<PFCategory[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());

    const [isTxModalOpen, setIsTxModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    
    const [newTx, setNewTx] = useState({ 
        descricao: '', 
        valor: '', 
        tipo: 'DESPESA' as any, 
        conta_id: '', 
        cartao_id: '', 
        categoria_id: '', 
        data: new Date().toISOString().split('T')[0],
        data_pagamento: new Date().toISOString().split('T')[0],
        status: 'CONSOLIDADO' as any,
        installments: 1,
        is_operation_transfer: false,
        operation_source_id: ''
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [accs, crds, txs, cats] = await Promise.all([
                personalFinanceService.getAccounts(activeUser.id),
                personalFinanceService.getCards(activeUser.id),
                personalFinanceService.getTransactions(activeUser.id, month, year),
                personalFinanceService.getCategories(activeUser.id)
            ]);
            setAccounts(accs);
            setCards(crds);
            setTransactions(txs);
            setCategories(cats);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [activeUser.id, month, year]);

    const handleSaveTx = async () => {
        if (!newTx.descricao || !newTx.valor || !newTx.data) return;
        
        try {
            await personalFinanceService.addTransaction({
                ...newTx,
                valor: parseFloat(newTx.valor.replace(',', '.'))
            }, activeUser.id);
            setIsTxModalOpen(false);
            setNewTx({ 
                descricao: '', 
                valor: '', 
                tipo: 'DESPESA', 
                conta_id: '', 
                cartao_id: '', 
                categoria_id: '', 
                data: new Date().toISOString().split('T')[0],
                data_pagamento: new Date().toISOString().split('T')[0],
                status: 'CONSOLIDADO',
                installments: 1,
                is_operation_transfer: false,
                operation_source_id: ''
            });
            loadData();
        } catch (e) {
            alert("Erro ao salvar transação");
        }
    };

    const stats = useMemo(() => {
        const income = transactions.filter(t => t.tipo === 'RECEITA').reduce((acc, t) => acc + t.valor, 0);
        const expense = transactions.filter(t => t.tipo === 'DESPESA').reduce((acc, t) => acc + t.valor, 0);
        const balance = income - expense;
        return { income, expense, balance };
    }, [transactions]);

    return (
        <div className="space-y-8 animate-in fade-in pb-24 font-sans">
            {/* Header - Padrão Menu Lateral */}
            <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button onClick={() => setMonth(m => m === 0 ? 11 : m - 1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                        <ChevronLeft size={16}/>
                    </button>
                    <span className="text-[10px] font-black text-white w-32 text-center uppercase tracking-widest">
                        {new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={() => setMonth(m => m === 11 ? 0 : m + 1)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                        <ChevronLeft size={16} className="rotate-180"/>
                    </button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <ArrowUpRight className="text-emerald-500" size={14}/> Receitas
                    </p>
                    <p className="text-2xl font-black text-white">{formatMoney(stats.income)}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <ArrowDownLeft className="text-rose-500" size={14}/> Despesas
                    </p>
                    <p className="text-2xl font-black text-rose-500">{formatMoney(stats.expense)}</p>
                </div>
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><Wallet size={64} className="text-white"/></div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Balanço Líquido</p>
                    <p className={`text-2xl font-black ${stats.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatMoney(stats.balance)}
                    </p>
                </div>
            </div>

            {/* Seção Principal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contas e Cartões */}
                <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <CardIcon size={14} className="text-blue-500"/> Contas & Cartões
                            </h3>
                            <button onClick={() => setIsManageModalOpen(true)} className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 hover:text-white transition-all">
                                <Settings2 size={14}/>
                            </button>
                        </div>
                        <div className="space-y-3">
                            {accounts.map(acc => (
                                <div key={acc.id} className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 group-hover:text-blue-500 transition-colors">
                                            <Banknote size={18}/>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white uppercase tracking-wider">{acc.nome}</p>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{acc.tipo}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-emerald-400">{formatMoney(acc.saldo)}</p>
                                </div>
                            ))}
                            {cards.map(card => (
                                <div key={card.id} className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 group-hover:text-pink-500 transition-colors">
                                            <CreditCard size={18}/>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white uppercase tracking-wider">{card.nome}</p>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Fecha dia {card.dia_fechamento}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-white">{formatMoney(card.limite)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Últimas Transações */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <LayoutGrid size={14} className="text-amber-500"/> Histórico Financeiro
                            </h3>
                            <button 
                                onClick={() => setIsTxModalOpen(true)}
                                className="px-4 py-2 bg-white text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all shadow-lg active:scale-95 flex items-center gap-2"
                            >
                                <Plus size={14}/> Novo Lançamento
                            </button>
                        </div>

                        <div className="space-y-3">
                            {transactions.length === 0 ? (
                                <div className="py-12 text-center">
                                    <div className="w-16 h-16 bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-800">
                                        <Clock size={24} className="text-slate-500" />
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Nenhuma transação este mês</p>
                                </div>
                            ) : (
                                transactions.map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                tx.tipo === 'RECEITA' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                            }`}>
                                                {tx.tipo === 'RECEITA' ? <ArrowUpRight size={18}/> : <ArrowDownLeft size={18}/>}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-black text-white uppercase tracking-wider">{tx.descricao}</p>
                                                    {tx.is_operation_transfer && (
                                                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] font-black rounded uppercase tracking-tighter">Operação</span>
                                                    )}
                                                    {tx.total_installments > 1 && (
                                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[8px] font-black rounded uppercase tracking-tighter">{tx.installment_number}/{tx.total_installments}</span>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                                    {new Date(tx.data).toLocaleDateString('pt-BR')} • {tx.category_name || 'Geral'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-sm font-black ${tx.tipo === 'RECEITA' ? 'text-emerald-400' : 'text-white'}`}>
                                                {tx.tipo === 'RECEITA' ? '+' : '-'}{formatMoney(tx.valor)}
                                            </p>
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">
                                                {tx.status === 'CONSOLIDADO' ? 'Liquidado' : 'Pendente'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Nova Transação - INTEGRADO */}
            {isTxModalOpen && (
                <Modal onClose={() => setIsTxModalOpen(false)} title="Novo Lançamento">
                    <div className="space-y-6 p-2">
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setNewTx(prev => ({ ...prev, tipo: 'RECEITA' }))}
                                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    newTx.tipo === 'RECEITA' ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                            >
                                Receita
                            </button>
                            <button 
                                onClick={() => setNewTx(prev => ({ ...prev, tipo: 'DESPESA' }))}
                                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    newTx.tipo === 'DESPESA' ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-900/20' : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                            >
                                Despesa
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Descrição</label>
                                <input 
                                    value={newTx.descricao}
                                    onChange={e => setNewTx(prev => ({ ...prev, descricao: e.target.value }))}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                    placeholder="Ex: Salário Mensal"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Valor (R$)</label>
                                    <input 
                                        value={newTx.valor}
                                        onChange={e => setNewTx(prev => ({ ...prev, valor: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                        placeholder="0,00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Parcelas</label>
                                    <input 
                                        type="number"
                                        value={newTx.installments}
                                        onChange={e => setNewTx(prev => ({ ...prev, installments: Number(e.target.value) }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-sm font-black text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Data Competência</label>
                                    <input 
                                        type="date"
                                        value={newTx.data}
                                        onChange={e => setNewTx(prev => ({ ...prev, data: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-xs font-black text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Data Pagamento</label>
                                    <input 
                                        type="date"
                                        value={newTx.data_pagamento}
                                        onChange={e => setNewTx(prev => ({ ...prev, data_pagamento: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-xs font-black text-white outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Integração com Operação */}
                            {newTx.tipo === 'RECEITA' && (
                                <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                            <ArrowRightLeft size={14}/> Transferir para Operação?
                                        </label>
                                        <input 
                                            type="checkbox"
                                            checked={newTx.is_operation_transfer}
                                            onChange={e => setNewTx(prev => ({ ...prev, is_operation_transfer: e.target.checked }))}
                                            className="w-5 h-5 rounded-lg accent-blue-500"
                                        />
                                    </div>
                                    {newTx.is_operation_transfer && (
                                        <select 
                                            value={newTx.operation_source_id}
                                            onChange={e => setNewTx(prev => ({ ...prev, operation_source_id: e.target.value }))}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-[10px] font-black text-white uppercase tracking-widest outline-none focus:border-blue-500"
                                        >
                                            <option value="">Selecione o Destino</option>
                                            <option value="CAIXA_LIVRE">Caixa Livre (Capital Próprio)</option>
                                            <option value="FONTE_EXTERNA">Fonte Externa (Investidores)</option>
                                        </select>
                                    )}
                                </div>
                            )}

                            <button 
                                onClick={handleSaveTx}
                                className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={18}/> Confirmar Lançamento
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
