
import React from 'react';
import { AlertTriangle, RotateCcw, Trash2, ShieldAlert, ArrowRight } from 'lucide-react';

interface ProfileDangerZoneProps {
    onResetData: () => void;
    onDeleteAccount: () => void;
}

export const ProfileDangerZone: React.FC<ProfileDangerZoneProps> = ({ onResetData, onDeleteAccount }) => {
    return (
        <div className="space-y-4">
            <div className="bg-rose-950/20 border border-rose-500/30 p-5 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-5 opacity-10 pointer-events-none">
                    <ShieldAlert size={100} className="text-rose-500"/>
                </div>

                <h3 className="text-rose-400 font-bold text-sm mb-3 flex items-center gap-2 relative z-10">
                    <AlertTriangle size={17} /> Área de Risco e Controle de Dados
                </h3>

                <div className="bg-rose-950/40 px-3.5 py-2.5 rounded-lg border border-rose-500/20 mb-4 relative z-10">
                    <p className="text-xs text-rose-200/90 leading-relaxed">
                        <strong className="font-semibold">Atenção Crítica:</strong> As ações abaixo são irreversíveis e manipulam permanentemente seu banco de dados na nuvem.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                    {/* Reset Data */}
                    <button
                        onClick={onResetData}
                        className="w-full flex items-center justify-between bg-slate-900/70 p-4 rounded-xl border border-rose-500/15 hover:border-rose-500/50 transition-colors group text-left cursor-pointer"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 bg-rose-500/10 rounded-lg text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-colors shrink-0">
                                <RotateCcw size={18}/>
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-white text-sm">Começar do Zero</p>
                                <p className="text-xs text-slate-400 mt-0.5">Apagar clientes e contratos</p>
                            </div>
                        </div>
                        <ArrowRight size={16} className="text-slate-600 group-hover:text-rose-400 transform group-hover:translate-x-0.5 transition-all shrink-0"/>
                    </button>

                    {/* Delete Account */}
                    <button
                        onClick={onDeleteAccount}
                        className="w-full flex items-center justify-between bg-slate-900/70 p-4 rounded-xl border border-rose-500/15 hover:border-rose-500/60 transition-colors group text-left cursor-pointer"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 bg-slate-800 rounded-lg text-slate-400 group-hover:bg-rose-600 group-hover:text-white transition-colors shrink-0">
                                <Trash2 size={18}/>
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-white text-sm">Excluir Conta</p>
                                <p className="text-xs text-slate-400 mt-0.5">Remover perfil e tudo vinculado</p>
                            </div>
                        </div>
                        <ArrowRight size={16} className="text-slate-600 group-hover:text-rose-400 transform group-hover:translate-x-0.5 transition-all shrink-0"/>
                    </button>
                </div>
            </div>

            <p className="text-center text-[11px] text-slate-500">
                Segurança CapitalFlow • Autenticação exigida para ações destrutivas.
            </p>
        </div>
    );
};
