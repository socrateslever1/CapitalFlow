
import React, { useState, useMemo } from 'react';
import { Search, MessageCircle, Users, Briefcase, ChevronRight, CheckSquare, Square, Trash2, X, Megaphone, ChevronDown } from 'lucide-react';
import { groupContractsByDebtorName } from '../../../utils/chatGroupHelpers';

interface ChatSidebarProps {
    chats: any[];
    clients: any[];
    team: any[];
    campaigns: any[];
    unreadCampaignCount?: number;
    selectedChat: any;
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    onSelectChat: (chat: any) => void;
    diffLabel: (ts: string) => string;
    onBulkDelete: (ids: string[]) => void;
    chatTheme?: 'dark' | 'blue';
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ 
    chats, clients, team, campaigns, unreadCampaignCount = 0, selectedChat, searchTerm, setSearchTerm, onSelectChat, diffLabel, onBulkDelete, chatTheme = 'dark'
}) => {
    const [activeTab, setActiveTab] = useState<'ACTIVE' | 'CLIENTS' | 'TEAM' | 'CAPTACAO'>('ACTIVE');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [isLightTheme, setIsLightTheme] = useState(false);

    // Filtra a lista correta baseada na aba e agrupa
    const displayList = useMemo(() => {
        let list: any[] = [];
        if (activeTab === 'ACTIVE') list = chats;
        else if (activeTab === 'CLIENTS') list = clients;
        else if (activeTab === 'TEAM') list = team;
        else if (activeTab === 'CAPTACAO') list = campaigns.map(c => ({ ...c, clientName: c.nome, type: 'CAMPAIGN' }));

        if (activeTab === 'ACTIVE' || activeTab === 'CLIENTS') {
            return groupContractsByDebtorName(list);
        }
        return list;
    }, [activeTab, chats, clients, team, campaigns]);

    const toggleSelection = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(x => x !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const enterSelectionMode = () => {
        setIsSelectionMode(true);
        setSelectedIds([]);
    };

    const exitSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    const executeDelete = () => {
        onBulkDelete(selectedIds);
        exitSelectionMode();
    };

    const toggleGroup = (groupId: string) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(groupId)) {
            newSet.delete(groupId);
        } else {
            newSet.add(groupId);
        }
        setExpandedGroups(newSet);
    };

    const renderItem = (item: any, isInsideGroup = false, index?: number | string) => {
        const key = item.loanId || item.profileId || item.id || index || Math.random().toString();
        const isActive = (selectedChat?.loanId === item.loanId && item.loanId) || 
                         (selectedChat?.profileId === item.profileId && item.profileId) ||
                         (selectedChat?.id === item.id && item.id);
        const isSelected = selectedIds.includes(key);
        
        return (
          <button
            id={key}
            key={key}
            onClick={() => isSelectionMode ? toggleSelection(key) : onSelectChat(item)}
            className={`w-full p-4 rounded-xl flex items-start gap-3 transition-all border ${
              isActive && !isSelectionMode
                ? 'bg-blue-900/10 border-blue-500/30 shadow-md' 
                : isSelected && isSelectionMode
                ? 'bg-rose-900/10 border-rose-500/30'
                : 'bg-transparent border-transparent hover:bg-slate-900 hover:border-slate-800'
            } ${isInsideGroup ? 'ml-4 w-[calc(100%-1rem)] border-l-2 border-l-slate-800 rounded-l-none' : ''}`}
          >
            {isSelectionMode ? (
                <div className={`mt-2 ${isSelected ? 'text-rose-500' : 'text-slate-500'}`}>
                    {isSelected ? <CheckSquare size={20}/> : <Square size={20}/>}
                </div>
            ) : (
                <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black border ${isActive ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {item.clientName?.charAt(0) || '?'}
                    </div>
                    {item.unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-black text-white border-2 border-slate-950 animate-bounce">
                        {item.unreadCount}
                        </div>
                    )}
                    {item.status === 'NOVO' && (
                        <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black text-[7px] font-black uppercase px-1 rounded shadow-sm">
                            Novo
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 min-w-0 text-left">
              <div className="flex justify-between items-baseline mb-1">
                <span className={`text-xs font-black uppercase truncate ${isActive && !isSelectionMode ? 'text-white' : 'text-slate-300'}`}>
                  {item.clientName}
                </span>
                {item.timestamp && (
                    <span className="text-[9px] text-slate-500 font-mono shrink-0 ml-2">
                      {diffLabel(item.timestamp)}
                    </span>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                  <p className={`text-[11px] truncate leading-tight ${isActive && !isSelectionMode ? 'text-blue-200' : 'text-slate-500'}`}>
                    {item.lastMessage || 'Novo Contato'}
                  </p>
                  {activeTab !== 'ACTIVE' && !isSelectionMode && <ChevronRight size={12} className="text-slate-500"/>}
              </div>
              
              {item.type === 'CAMPAIGN' && (
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 tracking-wider">
                    WhatsApp: {item.whatsapp || 'N/A'}
                  </p>
              )}
              {item.type === 'ACTIVE' && (
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 tracking-wider">
                    Contrato #{item.loanId?.slice(0,6)}
                  </p>
              )}
              {item.type === 'CLIENT' && (
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 tracking-wider">
                    Doc: {item.debtorDocument || 'N/A'}
                  </p>
              )}
              {item.type === 'TEAM' && (
                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 tracking-wider">
                    {item.role}
                  </p>
              )}
            </div>
          </button>
        );
    };

    return (
        <div className={`
            flex flex-col w-full md:w-[380px] lg:w-[420px] transition-all duration-300
            ${chatTheme === 'blue' ? 'bg-slate-900 border-r border-slate-700/50' : 'bg-slate-950 border-r border-slate-800'}
            ${selectedChat ? 'hidden md:flex' : 'flex'}
        `}>
          {/* Header de Busca e Abas */}
          <div className={`p-4 border-b space-y-3 ${chatTheme === 'blue' ? 'border-slate-700/50' : 'border-slate-800'}`}>
            {!isSelectionMode ? (
                <>
                    <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16}/>
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-blue-500 transition-all placeholder:text-slate-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    </div>
                    
                    <div className="flex bg-slate-900 p-1 rounded-xl">
                        <button 
                            onClick={() => setActiveTab('ACTIVE')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 ${activeTab === 'ACTIVE' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <MessageCircle size={12}/> Ativos
                        </button>
                        <button 
                            onClick={() => setActiveTab('CLIENTS')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 ${activeTab === 'CLIENTS' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Users size={12}/> Clientes
                        </button>
                        {/* Desativado temporariamente: TEAM
                        <button 
                            onClick={() => setActiveTab('TEAM')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 ${activeTab === 'TEAM' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Briefcase size={12}/> Equipe
                        </button>
                        */}
                        {/* Desativado temporariamente: CAPTACAO
                        <button 
                            onClick={() => setActiveTab('CAPTACAO')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1 relative ${activeTab === 'CAPTACAO' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Megaphone size={12}/> Captação
                            {unreadCampaignCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black flex items-center justify-center rounded-full ring-2 ring-slate-900">
                                    {unreadCampaignCount > 9 ? '9+' : unreadCampaignCount}
                                </span>
                            )}
                        </button>
                        */}
                    </div>

                    {activeTab === 'ACTIVE' && displayList.length > 0 && (
                        <div className="flex justify-end">
                             <button onClick={enterSelectionMode} className="text-[10px] text-rose-500 hover:text-rose-400 font-bold uppercase flex items-center gap-1">
                                 <Trash2 size={12}/> Gerenciar Chats
                             </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex items-center justify-between bg-rose-900/10 p-3 rounded-xl border border-rose-500/20">
                    <span className="text-rose-500 text-xs font-black uppercase">{selectedIds.length} Selecionados</span>
                    <div className="flex gap-2">
                        <button onClick={executeDelete} disabled={selectedIds.length === 0} className="p-2 bg-rose-600 text-white rounded-lg disabled:opacity-50">
                            <Trash2 size={16}/>
                        </button>
                        <button onClick={exitSelectionMode} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                            <X size={16}/>
                        </button>
                    </div>
                </div>
            )}
          </div>

          {/* Lista de Chats/Contatos */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                <Users size={32} className="mb-3 opacity-20"/>
                <p className="text-xs font-bold uppercase">Nada encontrado</p>
              </div>
            ) : (
              displayList.map((item: any, index: number) => {
                const itemKey = item.groupKey || item.id || item.loanId || item.profileId || index;
                if (item.isGroup) {
                    const isExpanded = expandedGroups.has(item.groupKey);
                    // Se o grupo tem apenas 1 item, renderiza o item diretamente para não ter clique duplo desnecessário
                    if (item.items.length === 1) {
                        return renderItem(item.items[0], false, index);
                    }

                    return (
                        <div key={itemKey} className="w-full">
                            <button
                                onClick={() => toggleGroup(item.groupKey)}
                                className="w-full p-3 rounded-xl flex items-center justify-between transition-all bg-slate-900/50 hover:bg-slate-900 border border-slate-800"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-slate-400 border border-slate-700">
                                        {item.clientName?.charAt(0) || '?'}
                                    </div>
                                    <div className="text-left">
                                        <span className="text-xs font-black uppercase text-slate-300 block">
                                            {item.clientName}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-bold">
                                            {item.items.length} contratos
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.unreadCount > 0 && (
                                        <div className="w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-[9px] font-black text-white">
                                            {item.unreadCount}
                                        </div>
                                    )}
                                    <ChevronDown size={16} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </button>
                            {isExpanded && (
                                <div className="mt-1 space-y-1">
                                    {item.items.map((subItem: any, subIndex: number) => renderItem(subItem, true, `${itemKey}-${subIndex}`))}
                                </div>
                            )}
                        </div>
                    );
                }

                return renderItem(item, false, index);
              })
            )}
          </div>
        </div>
    );
};
