
import React, { useMemo } from 'react';
import { UserProfile } from '../../types';
import { LogOut, Shield, Search, User, Edit, ShieldAlert } from 'lucide-react';
import { useMasterController } from './hooks/useMasterController';
import { MasterEditModal } from './components/MasterEditModal';

interface MasterScreenProps {
    activeUser: UserProfile;
    systemUsers: any[];
    fetchFullData: (id: string) => Promise<void>;
    handleLogout: () => void;
    showToast: (msg: string, type?: any) => void;
}

export const MasterScreen: React.FC<MasterScreenProps> = ({ 
    activeUser, systemUsers, fetchFullData, handleLogout, showToast 
}) => {
    
    const {
        searchTerm, setSearchTerm,
        isEditModalOpen, editingUser, openEditUser, closeEditUser,
        handleToggleAdminStatus, handleSaveUserChanges
    } = useMasterController(activeUser, fetchFullData, showToast);

    // Filtro local
    const filteredUsers = useMemo(() => {
        if (!searchTerm) return systemUsers;
        const lower = searchTerm.toLowerCase();
        return systemUsers.filter(u => 
            (u.name || u.nome_operador || '').toLowerCase().includes(lower) || 
            (u.email || u.usuario_email || '').toLowerCase().includes(lower)
        );
    }, [systemUsers, searchTerm]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-rose-500/30">
            {/* Header Exclusivo Master */}
            <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20">
                            <Shield size={24} className="text-white"/>
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white uppercase tracking-tighter leading-none">Painel Master</h1>
                            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1">Central de Atendimento (SAC)</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-rose-500/50 transition-all text-xs font-bold uppercase"
                    >
                        <LogOut size={16}/> Sair
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Usuários do Sistema</h2>
                        <p className="text-slate-500 text-xs mt-1">Gerencie senhas, e-mails e níveis de acesso de todos os operadores.</p>
                    </div>

                    <div className="relative w-full sm:w-80 group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={16} className="text-slate-500 group-focus-within:text-rose-500 transition-colors"/>
                        </div>
                        <input 
                            type="text" 
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none focus:border-rose-500 transition-all placeholder:text-slate-500 font-medium"
                            placeholder="Buscar operador..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {filteredUsers.map(user => {
                        const isMe = user.id === activeUser.id;
                        const isAdmin = user.accessLevel === 'ADMIN' || user.accessLevel === 1 || user.access_level === 1;

                        return (
                            <div key={user.id} className={`bg-slate-900 border ${isMe ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-slate-800'} rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-slate-700 transition-all group`}>
                                <div className="flex items-center gap-5 w-full md:w-auto">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 shrink-0 ${isAdmin ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                        {isAdmin ? <Shield size={24}/> : <User size={24}/>}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-black text-white uppercase truncate">{user.name || user.nome_operador}</h3>
                                            {isMe && <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded uppercase">Você</span>}
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-400 mt-1">
                                            <span className="truncate">{user.email || user.usuario_email}</span>
                                            <span className="hidden sm:inline text-slate-700">•</span>
                                            <span className="truncate text-slate-500">{user.businessName || user.nome_empresa || 'Sem Empresa'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
                                    <button 
                                        onClick={() => openEditUser(user)}
                                        className="flex-1 md:flex-none px-5 py-3 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                    >
                                        <Edit size={14}/> Dados / Senha
                                    </button>

                                    {!isMe && (
                                        <button 
                                            onClick={() => handleToggleAdminStatus(user)}
                                            className={`p-3 rounded-xl border transition-all ${isAdmin ? 'bg-slate-950 border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-500' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-emerald-500 hover:border-emerald-500'}`}
                                            title={isAdmin ? "Remover Admin" : "Promover a Admin"}
                                        >
                                            {isAdmin ? <ShieldAlert size={18}/> : <Shield size={18}/>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {filteredUsers.length === 0 && (
                        <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl opacity-50">
                            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Nenhum usuário encontrado.</p>
                        </div>
                    )}
                </div>
            </main>

            {isEditModalOpen && (
                <MasterEditModal 
                    user={editingUser} 
                    onClose={closeEditUser} 
                    onSave={handleSaveUserChanges} 
                />
            )}
        </div>
    );
};
