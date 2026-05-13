
import React from 'react';
import { AlertTriangle, RotateCcw, Trash2, ShieldAlert, ArrowRight } from 'lucide-react';

interface ProfileDangerZoneProps {
    onResetData: () => void;
    onDeleteAccount: () => void;
}

export const ProfileDangerZone: React.FC<ProfileDangerZoneProps> = ({ onResetData, onDeleteAccount }) => {
    return (
        <div className="animate-in slide-in-from-right space-y-6">
            <div className="bg-rose-950/20 border border-rose-500/30 p-6 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                    <ShieldAlert size={120} className="text-rose-500"/>
                </div>
                
                <h3 className="text-rose-500 font-black uppercase text-sm mb-4 flex items-center gap-2 relative z-10">
                    <AlertTriangle size={18} /> Área de Risco e Controle de Dados
                </h3>
                
                <div className="bg-rose-950/40 p-4 rounded-xl border border-rose-500/20 mb-6 relative z-10">
                    <p className="text-xs text-rose-200/90 font-medium leading-relaxed">
                        <strong className="uppercase">Atenção Crítica:</strong> As ações abaixo são irreversíveis. Elas manipulam permanentemente seu banco de dados na nuvem.
                    </p>
                </div>

                <div className="space-y-4 relative z-10">
                    {/* Reset Data */}
                    <button 
                        onClick={onResetData}
                        className="w-full flex items-center justify-between bg-slate-900/50 p-5 rounded-2xl border border-rose-500/10 hover:border-rose-500/40 transition-all group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                <RotateCcw size={20}/>
                            </div>
                            <div>
                                <p className="font-bold text-white text-sm uppercase">Começar do Zero</p>
                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">Apagar Clientes e Contratos</p>
                            </div>
                        </div>
                        <ArrowRight size={18} className="text-slate-700 group-hover:text-rose-500 transform group-hover:translate-x-1 transition-all"/>
                    </button>

                    {/* Delete Account */}
                    <button 
                        onClick={onDeleteAccount}
                        className="w-full flex items-center justify-between bg-slate-900/50 p-5 rounded-2xl border border-rose-500/10 hover:border-rose-500/60 transition-all group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-800 rounded-xl text-slate-500 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                <Trash2 size={20}/>
                            </div>
                            <div>
                                <p className="font-bold text-white text-sm uppercase">Excluir Conta</p>
                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-0.5">Remover Perfil e Tudo Vinculado</p>
                            </div>
                        </div>
                        <ArrowRight size={18} className="text-slate-700 group-hover:text-rose-500 transform group-hover:translate-x-1 transition-all"/>
                    </button>
                </div>
            </div>
            
            <p className="text-center text-[9px] text-slate-600 uppercase font-black tracking-[0.2em]">
                Segurança CapitalFlow • Autenticação exigida para ações destrutivas.
            </p>
        </div>
    );
};
