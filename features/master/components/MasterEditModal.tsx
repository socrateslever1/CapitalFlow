
import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Shield, KeyRound, User, Briefcase, Mail, Loader2, Save, CreditCard } from 'lucide-react';
import { capitalizeName } from '../../../utils/formatters';

interface MasterEditModalProps {
    user: any;
    onClose: () => void;
    onSave: (updatedUser: any) => void;
}

export const MasterEditModal: React.FC<MasterEditModalProps> = ({ user, onClose, onSave }) => {
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
            const levelToNum = (l: any) => {
                const s = String(l);
                if (s === '1' || s === 'ADMIN') return 1;
                if (s === '2' || s === 'OPERATOR') return 2;
                if (s === '3' || s === 'VIEWER') return 3;
                return 2;
            };

            setFormData({
                id: user.id,
                nome_operador: user.name || user.nome_operador || '',
                email: user.email || user.usuario_email || '',
                nome_empresa: user.businessName || user.nome_empresa || '',
                pix_key: user.pixKey || user.pix_key || '',
                access_level: levelToNum(user.accessLevel || user.access_level),
                new_password: '' 
            });
        }
    }, [user]);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(formData);
        setIsSaving(false);
    };

    return (
        <Modal onClose={onClose} title="Gestão de Credenciais (SAC)">
            <div className="space-y-5">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${formData.access_level === 1 ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                        <Shield size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-500">Nível de Acesso</p>
                        <select 
                            value={formData.access_level}
                            onChange={e => setFormData({...formData, access_level: Number(e.target.value)})}
                            className="bg-transparent text-white font-bold outline-none text-sm cursor-pointer hover:text-blue-400 transition-colors"
                        >
                            <option value={2}>Operador (Padrão)</option>
                            <option value={1}>Administrador Master</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><User size={10}/> Nome do Operador</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                            value={formData.nome_operador}
                            onChange={e => setFormData({...formData, nome_operador: e.target.value})}
                            onBlur={e => setFormData({...formData, nome_operador: capitalizeName(e.target.value)})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><Briefcase size={10}/> Empresa / Negócio</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                            value={formData.nome_empresa}
                            onChange={e => setFormData({...formData, nome_empresa: e.target.value})}
                            onBlur={e => setFormData({...formData, nome_empresa: capitalizeName(e.target.value)})}
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><Mail size={10}/> E-mail de Login</label>
                    <input 
                        type="email" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-500 ml-1 flex items-center gap-1"><CreditCard size={10}/> Chave PIX Padrão</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors"
                        value={formData.pix_key}
                        onChange={e => setFormData({...formData, pix_key: e.target.value})}
                    />
                </div>

                <div className="pt-4 border-t border-slate-800">
                    <label className="text-[10px] font-black uppercase text-rose-500 ml-1 mb-2 flex items-center gap-1"><KeyRound size={10}/> Redefinir Senha (SAC)</label>
                    <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-rose-900/30 rounded-xl p-3 text-rose-200 text-sm font-bold outline-none focus:border-rose-500 transition-colors placeholder:text-rose-900/50"
                        placeholder="Digite nova senha para forçar alteração..."
                        value={formData.new_password}
                        onChange={e => setFormData({...formData, new_password: e.target.value})}
                    />
                    <p className="text-[9px] text-slate-500 mt-1 ml-1">Deixe em branco para não alterar a senha atual do usuário.</p>
                </div>

                <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-900 text-slate-400 rounded-xl font-black uppercase text-xs hover:bg-slate-800 hover:text-white transition-colors">Cancelar</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={16}/> : <><Save size={16}/> Salvar Alterações</>}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
