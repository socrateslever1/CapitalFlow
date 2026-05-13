
import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Loader2, User, Save, Layers, ShieldCheck, ChevronDown } from 'lucide-react';

interface MemberEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    member: any;
    teams: any[];
    onSave: (memberId: string, updates: { role?: string, team_id?: string, supervisor_id?: string | null }) => Promise<void>;
}

export const MemberEditorModal: React.FC<MemberEditorModalProps> = ({ 
    isOpen, onClose, member, teams, onSave 
}) => {
    const [role, setRole] = useState(member?.role || 'MEMBER');
    const [teamId, setTeamId] = useState(member?.team_id || '');
    const [supervisorId, setSupervisorId] = useState(member?.linked_profile?.supervisor_id || '');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen || !member) return null;

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await onSave(member.id, { 
                role, 
                team_id: teamId,
                supervisor_id: supervisorId || null 
            });
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal onClose={onClose} title="Editar Membro">
            <div className="space-y-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                        {member.linked_profile?.avatar_url ? (
                            <img src={member.linked_profile.avatar_url} className="w-full h-full object-cover"/>
                        ) : <User size={20} className="text-slate-500"/>}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white uppercase">{member.full_name}</p>
                        <p className="text-[10px] text-slate-500">{member.cpf || 'CPF não informado'}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block flex items-center gap-1"><ShieldCheck size={12}/> Função / Permissão</label>
                        <div className="relative group">
                            <select 
                                value={role || 'MEMBER'} 
                                onChange={e => setRole(e.target.value)}
                                className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-10 text-white font-bold text-xs outline-none focus:border-blue-500 cursor-pointer"
                            >
                                <option value="MEMBER">Operador (Padrão)</option>
                                <option value="ADMIN">Administrador</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={16}/>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block flex items-center gap-1"><Layers size={12}/> Alocar na Equipe</label>
                        <div className="relative group">
                            <select 
                                value={teamId || ''} 
                                onChange={e => setTeamId(e.target.value)}
                                className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-10 text-white font-bold text-xs outline-none focus:border-blue-500 cursor-pointer"
                            >
                                {teams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={16}/>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block flex items-center gap-1"><User size={12}/> Definir Supervisor</label>
                        <div className="relative group">
                            <select 
                                value={supervisorId || ''} 
                                onChange={e => setSupervisorId(e.target.value)}
                                className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-10 text-white font-bold text-xs outline-none focus:border-blue-500 cursor-pointer"
                            >
                                <option value="">Sem Supervisor (Direto)</option>
                                {member.team_members?.filter((m: any) => m.profile_id && m.profile_id !== member.profile_id).map((m: any) => (
                                    <option key={m.profile_id} value={m.profile_id}>{m.full_name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={16}/>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleSave} 
                    disabled={isLoading} 
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16}/> Salvar Alterações</>}
                </button>
            </div>
        </Modal>
    );
};
