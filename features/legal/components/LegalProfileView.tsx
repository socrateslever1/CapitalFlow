
import React from 'react';
import { ChevronLeft, User, Scale, MapPin, Building, Lock } from 'lucide-react';
import { UserProfile } from '../../../types';

interface LegalProfileViewProps {
    activeUser: UserProfile | null;
    onBack: () => void;
}

export const LegalProfileView: React.FC<LegalProfileViewProps> = ({ activeUser, onBack }) => {
    if (!activeUser) return null;

    return (
        <div className="w-full relative z-10">
            {/* HEADER SECTION */}
            <header className="bg-slate-900/50 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md -mx-3 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-8 px-3 sm:px-6 lg:px-8 py-6 mb-8">
                <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <button 
                            onClick={onBack} 
                            className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-all border border-slate-700 hover:border-indigo-500 shadow-lg"
                        >
                            <ChevronLeft size={20} className="text-slate-300" />
                        </button>
                        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 ring-1 ring-white/10 hidden sm:flex">
                            <User className="text-white" size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">Perfil <span className="text-indigo-500">Jurídico</span></h1>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
                                Identificação e Prerrogativas do Credor
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-2xl">
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-full"><Building size={20}/></div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Nome Jurídico / Razão</p>
                            <p className="text-white font-bold">{activeUser.fullName || activeUser.businessName || 'Não informado'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                        <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-full"><Lock size={20}/></div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">CPF / CNPJ</p>
                            <p className="text-white font-bold">{activeUser.document || 'Não informado'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-full"><MapPin size={20}/></div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Praça de Pagamento (Foro)</p>
                            <p className="text-white font-bold">{activeUser.city || 'Manaus'} - {activeUser.state || 'AM'}</p>
                        </div>
                    </div>

                    <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl">
                        <p className="text-xs text-blue-300 leading-relaxed font-medium">
                            <span className="font-black uppercase text-[10px] block mb-1">Nota Legal:</span>
                            Estes dados são utilizados automaticamente na geração dos títulos executivos e termos de quitação. Certifique-se de que estão corretos conforme seus documentos oficiais.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
