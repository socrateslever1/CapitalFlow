import React from 'react';
import { Plus, Search, Edit, Trash2, CheckSquare, Square, XCircle, MapPin, Phone, ChevronLeft, Users } from 'lucide-react';
import { Client } from '../types';
import { startDictation } from '../utils/speech';
import { formatShortName, maskPhone, maskDocument } from '../utils/formatters';

interface ClientsPageProps {
  filteredClients: Client[];
  clientSearchTerm: string;
  setClientSearchTerm: (term: string) => void;
  openClientModal: (client?: Client) => void;
  openConfirmation: (config: any) => void;
  showToast: (msg: string, type?: 'error') => void;
  // Bulk actions props
  isBulkDeleteMode: boolean;
  toggleBulkDeleteMode: () => void;
  selectedClientsToDelete: string[];
  toggleClientSelection: (id: string) => void;
  executeBulkDelete: () => void;
  onDeleteClient: (id: string) => void; // NOVO PROP
  goBack?: () => void;
}

export const ClientsPage: React.FC<ClientsPageProps & { isStealthMode?: boolean }> = ({ 
  filteredClients, clientSearchTerm, setClientSearchTerm, 
  openClientModal, openConfirmation, showToast,
  isBulkDeleteMode, toggleBulkDeleteMode, selectedClientsToDelete, toggleClientSelection, executeBulkDelete,
  onDeleteClient,
  goBack,
  isStealthMode
}) => {
  return (
    <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20">
                        <Users size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Carteira de <span className="text-blue-500">Clientes</span></h1>
                        <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Gestão de Base Ativa</p>
                    </div>
                </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
                {isBulkDeleteMode ? (
                    <div className="flex gap-2 w-full md:w-auto animate-in fade-in slide-in-from-right">
                        <button onClick={executeBulkDelete} disabled={selectedClientsToDelete.length === 0} className="flex-1 md:flex-none px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-500 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                            <Trash2 size={16}/> Confirmar ({selectedClientsToDelete.length})
                        </button>
                        <button onClick={toggleBulkDeleteMode} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-700 transition-all flex items-center justify-center gap-2">
                            <XCircle size={16}/> Cancelar
                        </button>
                    </div>
                ) : (
                    <>
                        <button onClick={toggleBulkDeleteMode} className="flex-1 md:flex-none px-4 py-2 bg-slate-800 border border-slate-700 text-rose-400 rounded-xl text-[10px] font-black uppercase hover:bg-rose-900/20 hover:border-rose-500 transition-all flex items-center justify-center gap-2">
                            <Trash2 size={16}/> Excluir Vários
                        </button>
                        <button onClick={() => openClientModal()} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                            <Plus size={16}/> Novo Cliente
                        </button>
                    </>
                )}
            </div>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center gap-2">
            <Search className="text-slate-500 ml-2 shrink-0" size={18}/>
            <input type="text" placeholder="Buscar cliente..." className="bg-transparent w-full p-2 text-white outline-none text-sm" value={clientSearchTerm} onChange={e => setClientSearchTerm(e.target.value)} />
            <button onClick={() => startDictation(setClientSearchTerm, (msg) => showToast(msg, 'error'))} className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 hover:text-white hover:border-slate-600 transition-colors text-xs font-black uppercase shrink-0" title="Buscar por voz" type="button">🎙</button>
        </div>
        
        {/* GRID COMPACTA E MODERNA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...filteredClients].sort((a, b) => a.name.localeCompare(b.name)).map(client => (
                <div 
                    key={client.id} 
                    className={`bg-slate-900 border p-4 rounded-2xl transition-all group relative flex flex-col ${isBulkDeleteMode ? 'cursor-pointer border-slate-700 hover:border-blue-500' : 'border-slate-800 hover:border-blue-500/50 hover:shadow-lg'} ${isBulkDeleteMode && selectedClientsToDelete.includes(client.id) ? 'bg-blue-900/10 border-blue-500' : ''}`}
                    onClick={isBulkDeleteMode ? () => toggleClientSelection(client.id) : undefined}
                >
                    {isBulkDeleteMode && (
                        <div className="absolute top-3 right-3 text-blue-500 z-10">
                            {selectedClientsToDelete.includes(client.id) ? <CheckSquare size={20} className="fill-blue-500/20"/> : <Square size={20} className="text-slate-500"/>}
                        </div>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                        {client.fotoUrl ? (
                            <img src={client.fotoUrl} className="w-10 h-10 rounded-full object-cover border border-slate-700" alt={client.name}/>
                        ) : (
                            <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-black text-sm group-hover:text-blue-500 transition-colors border border-slate-700 shrink-0">
                                {client.name.charAt(0)}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-white text-sm truncate uppercase">{formatShortName(client.name)}</h3>
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] text-slate-500 truncate font-mono">{maskDocument((client as any).document, isStealthMode) || 'S/ CPF'}</p>
                                {client.createdAt && (
                                    <span className="text-[8px] text-slate-600 font-medium uppercase tracking-tighter">
                                        • {new Date(client.createdAt).toLocaleDateString('pt-BR')}
                                    </span>
                                )}
                            </div>
                        </div>
                        {!isBulkDeleteMode && (
                            <div className="flex gap-1">
                                <button onClick={() => openClientModal(client)} className="p-2 text-slate-500 hover:text-white bg-slate-950 rounded-xl hover:bg-slate-800 transition-colors" title="Editar">
                                    <Edit size={14}/>
                                </button>
                                <button onClick={() => onDeleteClient(client.id)} className="p-2 text-rose-500/70 hover:text-rose-500 bg-slate-950 rounded-xl hover:bg-rose-950/30 transition-colors" title="Excluir">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5 mt-auto">
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-xl">
                            <Phone size={12} className="text-blue-500"/> 
                            <span className="truncate">{maskPhone(client.phone, isStealthMode)}</span>
                        </div>
                        {client.document && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-xl">
                                <CheckSquare size={12} className="text-indigo-500"/>
                                <span className="truncate">{maskDocument(client.document, isStealthMode)}</span>
                            </div>
                        )}
                        {client.email && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-xl">
                                <Users size={12} className="text-purple-500"/>
                                <span className="truncate">{client.email}</span>
                            </div>
                        )}
                        {(client as any).address && (
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-950/50 p-2 rounded-xl">
                                <MapPin size={12} className="text-emerald-500"/>
                                <span className="truncate">{(client as any).address}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};