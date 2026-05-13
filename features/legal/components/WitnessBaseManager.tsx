
import React, { useState, useEffect } from 'react';
import { Users, Trash2, Loader2, UserPlus, AlertCircle } from 'lucide-react';
import { LegalWitness } from '../../../types';
import { witnessService } from '../services/witness.service';
import { maskDocument } from '../../../utils/formatters';

interface WitnessBaseManagerProps {
    profileId: string;
    onRefresh?: () => void;
}

export const WitnessBaseManager: React.FC<WitnessBaseManagerProps> = ({ profileId }) => {
    const [witnesses, setWitnesses] = useState<LegalWitness[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [newWitness, setNewWitness] = useState({ name: '', document: '' });
    const [error, setError] = useState<string | null>(null);

    const loadWitnesses = async () => {
        if (!profileId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await witnessService.list(profileId);
            setWitnesses(data);
        } catch (e: any) {
            setError(e.message || "Não foi possível conectar ao banco de dados.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadWitnesses();
    }, [profileId]);

    const handleAdd = async () => {
        if (!newWitness.name.trim() || !newWitness.document.trim()) {
            alert("Preencha o nome e documento da testemunha.");
            return;
        }
        
        setIsSaving(true);
        setError(null);
        try {
            await witnessService.save(newWitness, profileId);
            setNewWitness({ name: '', document: '' });
            await loadWitnesses();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remover esta testemunha da base habitual?")) return;
        try {
            await witnessService.delete(id, profileId);
            await loadWitnesses();
        } catch (e: any) {
            alert("Erro ao excluir: " + e.message);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-full"><Users size={20}/></div>
                    <div>
                        <h3 className="text-white font-black uppercase text-sm tracking-widest leading-none">Base Habitual</h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Conexão direta com a base de dados</p>
                    </div>
                </div>
            </div>

            {/* FORM ADICIONAR */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nome Completo</label>
                    <input 
                        value={newWitness.name} 
                        onChange={e => setNewWitness({...newWitness, name: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 transition-all"
                        placeholder="Ex: João da Silva"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">CPF</label>
                    <input 
                        value={newWitness.document} 
                        onChange={e => setNewWitness({...newWitness, document: maskDocument(e.target.value)})}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-white outline-none focus:border-indigo-500 transition-all"
                        placeholder="000.000.000-00"
                    />
                </div>
                <button 
                    onClick={handleAdd} 
                    disabled={isSaving || !newWitness.name.trim()}
                    className="h-[46px] bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all disabled:opacity-50 shadow-lg shadow-indigo-900/20"
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin"/> : <><UserPlus size={16}/> Adicionar à Base</>}
                </button>
            </div>

            {/* ERROR DISPLAY */}
            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400">
                    <AlertCircle size={18} className="shrink-0 mt-0.5"/>
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase">Erro de Banco de Dados</p>
                        <p className="text-xs">{error}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                {isLoading ? (
                    <div className="col-span-2 py-12 flex flex-col items-center justify-center gap-3 opacity-50">
                        <Loader2 className="text-indigo-500 animate-spin" size={32}/>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white">Acessando base de dados...</p>
                    </div>
                ) : witnesses.length === 0 && !error ? (
                    <div className="col-span-2 py-16 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest border-2 border-dashed border-slate-800 rounded-2xl">
                        A base está vazia. Cadastre testemunhas para agilizar seus contratos.
                    </div>
                ) : (
                    witnesses.map(w => (
                        <div key={w.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex justify-between items-center group hover:border-slate-600 transition-all">
                            <div>
                                <p className="text-xs font-bold text-white uppercase">{w.name}</p>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">{w.document}</p>
                            </div>
                            <button 
                                onClick={() => w.id && handleDelete(w.id)} 
                                className="p-2.5 text-slate-700 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                                title="Excluir da base"
                            >
                                <Trash2 size={16}/>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
