
import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { AlertTriangle, ShieldAlert, KeyRound, CheckCircle2, Loader2 } from 'lucide-react';

interface DangerModalProps {
    ui: any;
    closeModal: () => void;
    activeUser: any;
    onExecute: () => void;
}

export const ResetDataModal: React.FC<DangerModalProps> = ({ ui, closeModal, activeUser, onExecute }) => {
    return (
        <Modal onClose={closeModal} title="Zerar Dados">
            <div className="space-y-6">
                <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-2xl flex items-start gap-4">
                    <AlertTriangle className="text-rose-500 shrink-0 mt-1" size={24}/>
                    <div className="space-y-2">
                        <p className="text-sm font-bold text-white uppercase">Atenção: Ação Irreversível</p>
                        <p className="text-xs text-rose-200 leading-relaxed">
                            Ao confirmar, <b>todos os seus clientes, contratos e transações</b> serão deletados. Seu perfil e senha serão mantidos para um novo começo.
                        </p>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-800">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Digite sua senha para confirmar:</label>
                        <div className="relative">
                            <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"/>
                            <input 
                                type="password" 
                                value={ui.resetPasswordInput || ''}
                                onChange={e => ui.setResetPasswordInput(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white font-bold outline-none focus:border-rose-500 transition-colors"
                                placeholder="Senha de acesso"
                            />
                        </div>
                    </div>

                    <button 
                        onClick={onExecute}
                        disabled={!ui.resetPasswordInput || ui.isLoadingData}
                        className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black uppercase text-xs shadow-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                    >
                        {ui.isLoadingData ? <Loader2 className="animate-spin" size={18}/> : 'Sim, apagar todos os meus dados'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export const DeleteAccountModal: React.FC<DangerModalProps> = ({ ui, closeModal, activeUser, onExecute }) => {
    const canDelete = ui.deleteAccountAgree && ui.deleteAccountConfirm === 'DELETAR' && ui.resetPasswordInput;

    return (
        <Modal onClose={closeModal} title="Excluir Conta Permanentemente">
            <div className="space-y-6">
                <div className="bg-rose-600 p-6 rounded-2xl text-white relative overflow-hidden shadow-xl">
                    <ShieldAlert className="absolute -right-4 -bottom-4 opacity-20" size={120}/>
                    <h3 className="text-xl font-black uppercase mb-2 relative z-10 leading-none">Aviso Final</h3>
                    <p className="text-xs font-medium opacity-90 relative z-10 leading-relaxed">
                        Esta ação excluirá seu perfil de operador, acessos e todos os registros financeiros sem possibilidade de recuperação.
                    </p>
                </div>

                <div className="space-y-4">
                    <label className="flex items-start gap-4 p-4 bg-slate-950 border border-slate-800 rounded-2xl cursor-pointer group hover:border-rose-500/50 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={!!ui.deleteAccountAgree}
                            onChange={e => ui.setDeleteAccountAgree(e.target.checked)}
                            className="w-5 h-5 mt-1 accent-rose-600 rounded"
                        />
                        <span className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed select-none">
                            Eu compreendo que meu acesso será bloqueado e todos os meus dados vinculados serão destruídos permanentemente.
                        </span>
                    </label>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Sua Senha:</label>
                                <input 
                                    type="password" 
                                    value={ui.resetPasswordInput || ''}
                                    onChange={e => ui.setResetPasswordInput(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold text-sm outline-none focus:border-rose-500"
                                    placeholder="Senha atual"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Digite "DELETAR":</label>
                                <input 
                                    type="text" 
                                    value={ui.deleteAccountConfirm || ''}
                                    onChange={e => ui.setDeleteAccountConfirm(e.target.value.toUpperCase())}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white font-bold text-sm outline-none focus:border-rose-500"
                                    placeholder="Confirmação"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={onExecute}
                    disabled={!canDelete || ui.isLoadingData}
                    className="w-full py-5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black uppercase text-xs shadow-xl transition-all disabled:opacity-30 flex items-center justify-center gap-3"
                >
                    {ui.isLoadingData ? <Loader2 className="animate-spin" size={18}/> : 'Confirmar Exclusão Definitiva'}
                </button>
            </div>
        </Modal>
    );
};
