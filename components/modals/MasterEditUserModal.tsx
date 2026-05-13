
import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Shield, KeyRound, User, Briefcase, Mail, Loader2, Save, CreditCard, ChevronDown } from 'lucide-react';

interface MasterEditUserModalProps {
    user: any;
    onClose: () => void;
    onSave: (updatedUser: any) => void;
}

export const MasterEditUserModal: React.FC<MasterEditUserModalProps> = ({ user, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        id: '',
        nome_operador: '',
        email: '',
        nome_empresa: '',
        pix_key: '',
        access_level: 2,
        new_password: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setFormData({
                id: user.id,
                nome_operador: user.nome_operador || '',
                email: user.usuario_email || user.email || '',
                nome_empresa: user.nome_empresa || '',
                pix_key: user.pix_key || '',
                access_level: user.access_level || 2,
                new_password: '' // Sempre vazio por segurança
            });
        }
    }, [user]);

    const handleSave = async () => {
        setIsSaving(true);
        // Prepara objeto para salvar
        const payload = {
            ...user, // Mantém dados originais
            nome_operador: formData.nome_operador,
            usuario_email: formData.email,
            nome_empresa: formData.nome_empresa,
            pix_key: formData.pix_key,
            access_level: formData.access_level,
            // A senha só vai no payload se foi digitada
            ...(formData.new_password ? { newPassword: formData.new_password } : {})
        };
        
        await onSave(payload);
        setIsSaving(false);
    };

    return (
        <Modal onClose={onClose} title="Gestão de Acesso (SAC)">
            <div className="space-y-5">
                <div className="bg-slate-950 p-4 rounded-full border border-slate-800 flex items-center gap-4">
                    <div className={`p-3 rounded-full ${formData.access_level === 1 ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                        <Shield size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Nível de Acesso</p>
                        <div className="relative group">
                            <select 
                                value={formData.access_level}
                                onChange={e => setFormData({...formData, access_level: Number(e.target.value)})}
                                className="w-full appearance-none bg-transparent text-white font-bold outline-none text-sm cursor-pointer hover:text-blue-400 transition-colors pr-6"
                            >
                                <option value={2}>Operador (Padrão)</option>
                                <option value={1}>Master / Admin</option>
                            </select>
                            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-400" size={14}/>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><User size={10}/> Nome do Operador</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-full p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                            value={formData.nome_operador}
                            onChange={e => setFormData({...formData, nome_operador: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><Briefcase size={10}/> Empresa / Negócio</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-full p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                            value={formData.nome_empresa}
                            onChange={e => setFormData({...formData, nome_empresa: e.target.value})}
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><Mail size={10}/> E-mail de Login</label>
                    <input 
                        type="email" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-full p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><CreditCard size={10}/> Chave PIX Padrão</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-full p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                        value={formData.pix_key}
                        onChange={e => setFormData({...formData, pix_key: e.target.value})}
                    />
                </div>

                <div className="pt-4 border-t border-slate-800">
                    <label className="text-[10px] font-black uppercase text-rose-500 ml-1 mb-2 flex items-center gap-1"><KeyRound size={10}/> Redefinir Senha (Opcional)</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-rose-900/30 rounded-full p-3 text-rose-200 text-sm font-bold outline-none focus:border-rose-500 transition-colors placeholder:text-rose-900/50"
                        placeholder="Digite nova senha para alterar..."
                        value={formData.new_password}
                        onChange={e => setFormData({...formData, new_password: e.target.value})}
                    />
                    <p className="text-[9px] text-slate-500 mt-1 ml-1">Deixe em branco para manter a senha atual do usuário.</p>
                </div>

                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-900 text-slate-400 rounded-full font-black uppercase text-xs hover:bg-slate-800 hover:text-white transition-colors">Cancelar</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="flex-[2] py-3 bg-blue-600 text-white rounded-full font-black uppercase text-xs hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={16}/> : <><Save size={16}/> Salvar Alterações</>}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
