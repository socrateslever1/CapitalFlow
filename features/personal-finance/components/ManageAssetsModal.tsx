
import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Wallet, CreditCard, Trash2, Plus } from 'lucide-react';
import { personalFinanceService } from '../services/personalFinanceService';
import { PFAccount, PFCard } from '../types';

interface Props {
    onClose: () => void;
    profileId: string;
    accounts: PFAccount[];
    cards: PFCard[];
    onRefresh: () => void;
}

export const ManageAssetsModal: React.FC<Props> = ({ onClose, profileId, accounts, cards, onRefresh }) => {
    const [tab, setTab] = useState<'ACCOUNTS' | 'CARDS'>('ACCOUNTS');
    
    // Forms
    const [accForm, setAccForm] = useState({ nome: '', saldo: '' });
    const [cardForm, setCardForm] = useState({ nome: '', limite: '', fechamento: '1', vencimento: '10' });

    const handleAddAccount = async () => {
        if (!accForm.nome) return;
        await personalFinanceService.addAccount({
            nome: accForm.nome,
            saldo: parseFloat(accForm.saldo.replace(',', '.')) || 0,
            tipo: 'CORRENTE'
        }, profileId);
        setAccForm({ nome: '', saldo: '' });
        onRefresh();
    };

    const handleAddCard = async () => {
        if (!cardForm.nome) return;
        await personalFinanceService.addCard({
            nome: cardForm.nome,
            limite: parseFloat(cardForm.limite.replace(',', '.')) || 0,
            dia_fechamento: parseInt(cardForm.fechamento),
            dia_vencimento: parseInt(cardForm.vencimento)
        }, profileId);
        setCardForm({ nome: '', limite: '', fechamento: '1', vencimento: '10' });
        onRefresh();
    };

    const handleDelete = async (id: string, type: 'ACCOUNT' | 'CARD') => {
        if (!confirm("Tem certeza?")) return;
        if (type === 'ACCOUNT') await personalFinanceService.deleteAccount(id);
        else await personalFinanceService.deleteCard(id);
        onRefresh();
    };

    return (
        <Modal onClose={onClose} title="Gerenciar Ativos">
            <div className="space-y-6">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button onClick={() => setTab('ACCOUNTS')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${tab === 'ACCOUNTS' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
                        <Wallet size={14}/> Contas / Carteiras
                    </button>
                    <button onClick={() => setTab('CARDS')} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${tab === 'CARDS' ? 'bg-purple-600 text-white' : 'text-slate-500'}`}>
                        <CreditCard size={14}/> Cartões Crédito
                    </button>
                </div>

                {tab === 'ACCOUNTS' && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                            <h4 className="text-xs font-bold text-white uppercase">Adicionar Conta</h4>
                            <input type="text" placeholder="Nome (Ex: Banco X, Cofre)" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={accForm.nome} onChange={e => setAccForm({...accForm, nome: e.target.value})} />
                            <input type="text" placeholder="Saldo Inicial (R$)" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={accForm.saldo} onChange={e => setAccForm({...accForm, saldo: e.target.value})} />
                            <button onClick={handleAddAccount} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs">Salvar Conta</button>
                        </div>
                        
                        <div className="space-y-2">
                            {accounts.map(acc => (
                                <div key={acc.id} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800">
                                    <div>
                                        <p className="text-xs font-bold text-white">{acc.nome}</p>
                                        <p className="text-[10px] text-slate-500">Saldo: R$ {acc.saldo.toFixed(2)}</p>
                                    </div>
                                    <button onClick={() => handleDelete(acc.id, 'ACCOUNT')} className="p-2 text-slate-500 hover:text-rose-500 bg-slate-950 rounded-lg"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'CARDS' && (
                    <div className="space-y-4 animate-in slide-in-from-right">
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                            <h4 className="text-xs font-bold text-white uppercase">Adicionar Cartão</h4>
                            <input type="text" placeholder="Nome (Ex: Nubank Final 1234)" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={cardForm.nome} onChange={e => setCardForm({...cardForm, nome: e.target.value})} />
                            <input type="text" placeholder="Limite (R$)" className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={cardForm.limite} onChange={e => setCardForm({...cardForm, limite: e.target.value})} />
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" placeholder="Dia Fech." className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={cardForm.fechamento} onChange={e => setCardForm({...cardForm, fechamento: e.target.value})} />
                                <input type="number" placeholder="Dia Venc." className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs outline-none" value={cardForm.vencimento} onChange={e => setCardForm({...cardForm, vencimento: e.target.value})} />
                            </div>
                            <button onClick={handleAddCard} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase text-xs">Salvar Cartão</button>
                        </div>

                        <div className="space-y-2">
                            {cards.map(card => (
                                <div key={card.id} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800">
                                    <div>
                                        <p className="text-xs font-bold text-white">{card.nome}</p>
                                        <p className="text-[10px] text-slate-500">Limite: R$ {card.limite.toFixed(2)}</p>
                                    </div>
                                    <button onClick={() => handleDelete(card.id, 'CARD')} className="p-2 text-slate-500 hover:text-rose-500 bg-slate-950 rounded-lg"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
