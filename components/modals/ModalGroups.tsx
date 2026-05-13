
import React from 'react';
import { useModal } from '../../contexts/ModalContext';
import { Modal } from '../ui/Modal';
import { PaymentManagerModal } from './PaymentManagerModal';
import { CalculatorModal } from './CalculatorModal';
import { FlowModal } from './FlowModal';
import { ReceiptModal } from './ReceiptModal';
import { MessageHubModal } from './MessageHubModal';
import { AIAssistantModal } from './AIAssistantModal';
import { NoteWrapper } from './ModalWrappers'; 
import { Copy, KeyRound, User, Camera, ShieldCheck, MapPin, Mail, Hash, Loader2 } from 'lucide-react';
import { maskPhone, maskDocument, capitalizeName } from '../../utils/formatters';

export const ClientModals = () => {
    const { activeModal, closeModal, ui, clientCtrl } = useModal();
    const { clientForm, editingClient } = ui;
    const canImportContacts = 'contacts' in navigator && 'ContactsManager' in window;

    if (activeModal?.type !== 'CLIENT_FORM') return null;

    // Recupera códigos (Edição ou Rascunho gerado pelo controller)
    const accessCode = editingClient?.access_code || ui.clientDraftAccessCode;
    const clientNumber = editingClient?.client_number || ui.clientDraftNumber;

    return (
       <Modal onClose={closeModal} title={editingClient ? 'Editar Cadastro' : 'Novo Cadastro'}>
           <div className="space-y-6 pb-4">
               {/* Header Section: Avatar + Credentials */}
               <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-950/40 p-5 rounded-3xl border border-slate-800/50">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className="relative w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden cursor-pointer group" onClick={() => editingClient && ui.clientAvatarInputRef.current?.click()}>
                            {clientForm.fotoUrl ? <img src={clientForm.fotoUrl} alt="Avatar" className="w-full h-full object-cover" /> : <User size={32} className="text-slate-600" />}
                            {editingClient && <div className="absolute inset-0 bg-blue-600/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Camera className="text-white" size={18} /></div>}
                        </div>
                        {editingClient && <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Alterar Foto</span>}
                        {!editingClient && <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Foto via Edição</span>}
                    </div>

                    <div className="flex-1 w-full space-y-3">
                        <div className="flex justify-between items-center bg-slate-900/50 px-4 py-2.5 rounded-2xl border border-slate-800/30">
                            <span className="text-[9px] uppercase text-slate-500 font-black tracking-widest">Acesso</span>
                            <span className="text-sm font-black text-white tracking-widest font-mono">{accessCode || '----'}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/50 px-4 py-2.5 rounded-2xl border border-slate-800/30">
                            <span className="text-[9px] uppercase text-slate-500 font-black tracking-widest">Nº Cliente</span>
                            <span className="text-sm font-black text-blue-500 font-mono">{clientNumber || '----'}</span>
                        </div>
                        {editingClient?.createdAt && (
                           <div className="flex justify-between items-center bg-slate-900/50 px-4 py-2.5 rounded-2xl border border-slate-800/30">
                               <span className="text-[9px] uppercase text-slate-500 font-black tracking-widest">Cadastro</span>
                               <span className="text-[10px] font-black text-slate-400 font-mono">{new Date(editingClient.createdAt).toLocaleDateString('pt-BR')}</span>
                           </div>
                        )}
                    </div>
               </div>

               <input type="file" ref={ui.clientAvatarInputRef} className="hidden" accept="image/*" onChange={clientCtrl.handleAvatarUpload}/>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                    <div className="sm:col-span-2">
                        <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider">Nome Completo</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" 
                            value={clientForm.name || ''} 
                            onChange={e => ui.setClientForm({...clientForm, name: e.target.value})} 
                            onBlur={e => ui.setClientForm({...clientForm, name: capitalizeName(e.target.value)})}
                            placeholder="Nome do cliente"
                        />
                    </div>
                    
                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider">WhatsApp</label>
                        <div className="flex gap-2">
                            <input type="tel" className="w-full bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.phone || ''} onChange={e => ui.setClientForm({...clientForm, phone: maskPhone(e.target.value)})} placeholder="(00) 00000-0000"/>
                            {canImportContacts && <button onClick={clientCtrl.handlePickContact} className="px-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-400 hover:bg-blue-600 hover:text-white transition-all"><User size={18}/></button>}
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider">CPF / CNPJ</label>
                        <input type="text" className="w-full bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.document || ''} onChange={e => ui.setClientForm({...clientForm, document: maskDocument(e.target.value)})} placeholder="000.000.000-00"/>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider flex items-center gap-1.5"><Mail size={12} className="text-blue-500"/> E-mail</label>
                        <input type="email" className="w-full bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.email || ''} onChange={e => ui.setClientForm({...clientForm, email: e.target.value})} placeholder="email@exemplo.com"/>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider flex items-center gap-1.5"><MapPin size={12} className="text-blue-500"/> Endereço</label>
                        <div className="space-y-3">
                            <input type="text" className="w-full bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.address || ''} onChange={e => ui.setClientForm({...clientForm, address: e.target.value})} placeholder="Rua, nº, bairro"/>
                            <div className="grid grid-cols-3 gap-3">
                                <input type="text" className="col-span-2 bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.city || ''} onChange={e => ui.setClientForm({...clientForm, city: e.target.value})} placeholder="Cidade"/>
                                <input type="text" className="bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800/80 text-white outline-none text-sm text-center focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.state || ''} onChange={e => ui.setClientForm({...clientForm, state: e.target.value.toUpperCase()})} maxLength={2} placeholder="UF"/>
                            </div>
                        </div>
                    </div>
               </div>

               <div className="space-y-2">
                   <label className="text-[10px] uppercase text-slate-500 font-black ml-2 block tracking-wider">Observações Internas</label>
                   <textarea placeholder="Notas sobre o perfil..." className="w-full bg-slate-950/50 p-4 rounded-3xl border border-slate-800/80 text-white outline-none h-24 text-sm resize-none focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" value={clientForm.notes || ''} onChange={e => ui.setClientForm({...clientForm, notes: e.target.value})} />
               </div>

               <button 
                onClick={clientCtrl.handleSaveClient} 
                disabled={ui.isSaving} 
                className="w-full py-4.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black rounded-2xl uppercase shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 text-xs tracking-widest disabled:opacity-50 transition-all active:scale-[0.98]"
               >
                   {ui.isSaving ? <Loader2 className="animate-spin" size={16}/> : <ShieldCheck size={16}/>}
                   {ui.isSaving ? 'Processando...' : 'Finalizar Cadastro'}
               </button>
           </div>
       </Modal>
    );
};

export const FinanceModals = () => {
    const { activeModal, closeModal, ui, sourceCtrl, paymentCtrl, activeUser, sources } = useModal();
    const staffMembers = ui.staffMembers || [];

    return (
        <>
            {activeModal?.type === 'SOURCE_FORM' && (
                <Modal onClose={closeModal} title="Configuração de Fundo">
                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] uppercase text-slate-500 font-black ml-1 mb-2 block">Identificação</label>
                            <input type="text" placeholder="Nome da Fonte" className="w-full bg-slate-950 p-4 rounded-2xl text-white outline-none border border-slate-800 focus:border-blue-500 transition-all" value={ui.sourceForm.name || ''} onChange={e => ui.setSourceForm({...ui.sourceForm, name: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-black ml-1 mb-2 block">Tipo</label>
                                <select className="w-full bg-slate-950 p-4 rounded-2xl text-white outline-none border border-slate-800" value={ui.sourceForm.type || 'BANK'} onChange={e => ui.setSourceForm({...ui.sourceForm, type: e.target.value})}>
                                    <option value="BANK">Banco / Digital</option><option value="CASH">Espécie</option><option value="WALLET">Carteira</option><option value="CARD">Cartão</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-black ml-1 mb-2 block">Saldo Inicial</label>
                                <input type="text" inputMode="decimal" placeholder="R$ 0,00" className="w-full bg-slate-950 p-4 rounded-2xl text-white outline-none border border-slate-800" value={ui.sourceForm.balance || ''} onChange={e => ui.setSourceForm({...ui.sourceForm, balance: e.target.value.replace(/[^0-9.,]/g, '')})} />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] uppercase text-slate-500 font-black ml-1 mb-2 block">URL do Ícone / Logo (Opcional)</label>
                            <input type="text" placeholder="https://..." className="w-full bg-slate-950 p-4 rounded-2xl text-white outline-none border border-slate-800 focus:border-blue-500 transition-all" value={ui.sourceForm.logo_url || ''} onChange={e => ui.setSourceForm({...ui.sourceForm, logo_url: e.target.value})} />
                        </div>

                        {/* NOVO: DESIGNAR CARTEIRA A OPERADOR (EXCLUSIVIDADE) */}
                        {activeUser?.accessLevel === 'ADMIN' && staffMembers.length > 0 && (
                            <div className="bg-indigo-950/20 border border-indigo-500/20 p-5 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-indigo-400">
                                    <ShieldCheck size={18}/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Acesso Privado</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-tight">Ao selecionar um colaborador, esta carteira só poderá ser usada por ele e pelo administrador.</p>
                                <select 
                                    className="w-full bg-slate-900 border border-indigo-500/30 rounded-full p-3 text-xs text-white outline-none"
                                    value={ui.sourceForm.operador_permitido_id || ''}
                                    onChange={e => ui.setSourceForm({...ui.sourceForm, operador_permitido_id: e.target.value || null})}
                                >
                                    <option value="">Carteira Pública (Todos)</option>
                                    {staffMembers.map((s: any) => (
                                        <option key={s.id} value={s.id}>Acesso exclusivo: {s.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button onClick={sourceCtrl.handleSaveSource} disabled={ui.isSaving} className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl uppercase shadow-xl transition-all">{ui.isSaving ? 'Sincronizando...' : 'Salvar Fonte'}</button>
                    </div>
                </Modal>
            )}

            {activeModal?.type === 'ADD_FUNDS' && (
                <Modal onClose={closeModal} title={`Aporte: ${activeModal.payload.name}`}>
                    <div className="space-y-4">
                        <input type="text" inputMode="decimal" placeholder="Valor (R$)" className="w-full bg-slate-950 p-4 rounded-full text-white text-xl font-bold outline-none border border-slate-800" value={ui.addFundsValue || ''} onChange={e => ui.setAddFundsValue(e.target.value.replace(/[^0-9.,]/g, ''))} autoFocus />
                        <button onClick={sourceCtrl.handleAddFunds} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-full uppercase">Confirmar Aporte</button>
                    </div>
                </Modal>
            )}

            {activeModal?.type === 'PAYMENT' && ui.paymentModal && (
                <PaymentManagerModal data={ui.paymentModal} onClose={closeModal} isProcessing={ui.isProcessingPayment} paymentType={ui.paymentType} setPaymentType={ui.setPaymentType} avAmount={ui.avAmount} setAvAmount={ui.setAvAmount} onConfirm={paymentCtrl.handlePayment} onOpenMessage={(l: any) => { ui.setMessageModalLoan(l); ui.openModal('MESSAGE_HUB'); }} />
            )}

            {activeModal?.type === 'WITHDRAW' && (
                <Modal onClose={closeModal} title="Resgatar Lucros">
                    <div className="space-y-6 pb-2">
                        <div className="bg-slate-950/50 p-6 rounded-3xl border border-slate-800/50 text-center shadow-inner relative overflow-hidden group">
                            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Disponível para Saque</p>
                            <p className="text-3xl font-black text-emerald-400 tracking-tight">
                                R$ {
                                    (() => {
                                        const caixaLivreSource = (sources || []).find(s => {
                                            const n = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                                            return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
                                        });
                                        const sourceBalance = Number(caixaLivreSource?.balance) || 0;
                                        const profileBalance = Number(activeUser?.interestBalance) || 0;
                                        return (sourceBalance + profileBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                                    })()
                                }
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider">Valor do Resgate</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal" 
                                    placeholder="R$ 0,00" 
                                    className="w-full bg-slate-950/50 p-4 rounded-2xl text-white font-bold outline-none border border-slate-800 focus:border-emerald-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-700" 
                                    value={ui.withdrawValue || ''} 
                                    onChange={e => ui.setWithdrawValue(e.target.value.replace(/[^0-9.,]/g, ''))} 
                                />
                            </div>

                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-black ml-2 mb-1.5 block tracking-wider">Destino do Capital</label>
                                <select 
                                    className="w-full bg-slate-950/50 p-4 rounded-2xl text-white font-bold outline-none border border-slate-800 focus:border-emerald-500/50 focus:bg-slate-900 transition-all cursor-pointer appearance-none" 
                                    value={ui.withdrawSourceId || ''} 
                                    onChange={e => ui.setWithdrawSourceId(e.target.value)}
                                >
                                    <option value="">Selecione o destino...</option>
                                    <option value="EXTERNAL_WITHDRAWAL">Saque Externo (Dinheiro/PIX)</option>
                                    {sources.map((s: any) => <option key={s.id} value={s.id}>Reinvestir em: {s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <button 
                            onClick={sourceCtrl.handleWithdrawProfit} 
                            className="w-full py-4.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black rounded-2xl uppercase shadow-xl shadow-emerald-500/20 transition-all active:scale-[0.98] tracking-widest text-xs"
                        >
                            Confirmar Resgate
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
};
