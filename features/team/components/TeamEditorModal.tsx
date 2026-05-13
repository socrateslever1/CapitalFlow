
import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Loader2, Layers, Trash2, Save } from 'lucide-react';

interface TeamEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => Promise<void>;
    onDelete?: () => Promise<void>;
    initialName?: string;
    isEditing: boolean;
}

export const TeamEditorModal: React.FC<TeamEditorModalProps> = ({ 
    isOpen, onClose, onSave, onDelete, initialName = '', isEditing 
}) => {
    const [name, setName] = useState(initialName);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setName(initialName);
    }, [initialName, isOpen]);

    const handleSave = async () => {
        if (!name.trim()) return;
        setIsLoading(true);
        try {
            await onSave(name);
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        
        const confirmed = window.confirm("ATENÇÃO: Tem certeza que deseja excluir esta equipe? \n\nEsta ação não pode ser desfeita e todos os membros serão desvinculados.");
        if (!confirmed) return;

        setIsLoading(true);
        try {
            await onDelete();
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal onClose={onClose} title={isEditing ? 'Gerenciar Equipe' : 'Nova Equipe'}>
            <div className="space-y-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
                    <Layers size={24} className="text-blue-500" />
                    <div>
                        <p className="text-xs font-bold text-white uppercase">Dados da Equipe</p>
                        <p className="text-[10px] text-slate-500">Defina o nome de identificação do time.</p>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome da Equipe</label>
                    <input 
                        className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                        value={name || ''}
                        onChange={e => setName(e.target.value)}
                        placeholder="Ex: Time Comercial"
                        autoFocus
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    {isEditing && onDelete && (
                        <button 
                            type="button"
                            onClick={handleDelete} 
                            disabled={isLoading}
                            className="p-4 bg-rose-950/30 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-950/50 transition-all flex items-center justify-center"
                            title="Excluir Equipe"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={20}/> : <Trash2 size={20}/>}
                        </button>
                    )}
                    <button 
                        type="button"
                        onClick={handleSave} 
                        disabled={isLoading || !name.trim()} 
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16}/> Salvar Equipe</>}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
