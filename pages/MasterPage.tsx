
import React from 'react';
import { Edit, ShieldAlert, KeyRound, Shield, User, Search } from 'lucide-react';

interface MasterPageProps {
  allUsers: any[];
  sacSearch: string;
  setSacSearch: (term: string) => void;
  setMasterEditUser: (user: any) => void;
  handleToggleAdmin: (user: any) => void;
  handleAdminResetPassword: (user: any) => void;
  ui?: any;
}

export const MasterPage: React.FC<MasterPageProps> = ({ 
  allUsers, sacSearch, setSacSearch, setMasterEditUser, handleToggleAdmin, handleAdminResetPassword, ui
}) => {
  
  // Função helper para verificar online (últimos 5 min)
  const isOnline = (lastActive?: string) => {
      if (!lastActive) return false;
      const diff = new Date().getTime() - new Date(lastActive).getTime();
      return diff < 5 * 60 * 1000; // 5 minutos
  };

  const handleOpenEdit = (u: any) => {
      setMasterEditUser(u);
      ui?.openModal('MASTER_EDIT_USER');
  };

  return (
    <div className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-end items-start sm:items-center gap-4 mb-6">
                <div className="bg-slate-950 border border-slate-800 p-2 rounded-2xl flex items-center gap-2 w-full sm:w-auto">
                    <Search className="text-slate-500 ml-2" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Buscar usuário, email..." 
                        className="bg-transparent w-full sm:w-64 p-2 text-white text-sm outline-none font-bold" 
                        value={sacSearch} 
                        onChange={e => setSacSearch(e.target.value)} 
                    />
                </div>
            </div>

            <div className="space-y-3">
                {allUsers.filter(u => (u.nome_operador || '').toLowerCase().includes(sacSearch.toLowerCase()) || (u.usuario_email || '').toLowerCase().includes(sacSearch.toLowerCase())).map(u => {
                    const userIsOnline = isOnline(u.last_active_at);
                    const isAdmin = u.access_level === 1;
                    
                    return (
                        <div key={u.id} className="flex flex-col sm:flex-row items-center justify-between bg-slate-950 p-4 rounded-2xl border border-slate-800 gap-4 group hover:border-slate-700 transition-all">
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 shrink-0 ${isAdmin ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                    {isAdmin ? <Shield size={20}/> : <User size={20}/>}
                                </div>
                                
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-black text-white uppercase truncate">{u.nome_operador}</p>
                                        {userIsOnline && (
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" title="Online Agora"></span>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">{u.usuario_email}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{u.nome_empresa || 'Empresa não definida'}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-0 border-slate-800 pt-3 sm:pt-0">
                                <button 
                                    onClick={() => handleOpenEdit(u)} 
                                    className="px-4 py-2 bg-slate-900 border border-slate-800 text-blue-400 hover:text-white hover:bg-blue-600 rounded-xl transition-all text-[10px] font-black uppercase flex items-center gap-2 flex-1 sm:flex-none justify-center"
                                >
                                    <Edit size={14}/> Editar / Senha
                                </button>
                                
                                {isAdmin ? (
                                    <button 
                                        onClick={() => handleToggleAdmin(u)} 
                                        className="p-2.5 bg-slate-900 border border-slate-800 text-slate-500 hover:text-rose-500 hover:border-rose-500/30 rounded-xl transition-all"
                                        title="Remover Admin"
                                    >
                                        <ShieldAlert size={16}/>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => handleToggleAdmin(u)} 
                                        className="p-2.5 bg-slate-900 border border-slate-800 text-slate-500 hover:text-emerald-500 hover:border-emerald-500/30 rounded-xl transition-all"
                                        title="Promover a Admin"
                                    >
                                        <Shield size={16}/>
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                
                {allUsers.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-xs font-bold uppercase">Nenhum usuário encontrado.</div>
                )}
            </div>
        </div>
    </div>
  );
};
