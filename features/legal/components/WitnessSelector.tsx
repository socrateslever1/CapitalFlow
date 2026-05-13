import React, { useState, useEffect } from 'react';
import { Users, Loader2, Check } from 'lucide-react';
import { LegalWitness } from '../../../types';
import { witnessService } from '../services/witness.service';

interface WitnessSelectorProps {
    profileId: string;
    selectedWitnesses: LegalWitness[];
    onWitnessSelect: (witness: LegalWitness) => void;
    onWitnessRemove: (witnessId: string) => void;
}

export const WitnessSelector: React.FC<WitnessSelectorProps> = ({ profileId, selectedWitnesses, onWitnessSelect, onWitnessRemove }) => {
    const [witnesses, setWitnesses] = useState<LegalWitness[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadWitnesses = async () => {
            setIsLoading(true);
            try {
                const data = await witnessService.list(profileId);
                setWitnesses(data);
            } catch (e) {
                console.error("Erro ao carregar testemunhas:", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadWitnesses();
    }, [profileId]);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2"><Users size={14}/> Selecionar Testemunhas</h4>
            
            {isLoading ? (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="animate-spin text-indigo-500" size={20}/>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {witnesses.map(w => {
                        const isSelected = selectedWitnesses.some(sw => sw.id === w.id);
                        return (
                            <button
                                key={w.id}
                                onClick={() => isSelected ? onWitnessRemove(w.id!) : onWitnessSelect(w)}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}
                            >
                                <div>
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{w.name}</p>
                                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">{w.document}</p>
                                </div>
                                {isSelected && <Check size={16} className="text-indigo-400" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
