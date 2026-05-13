
import React, { useState, useRef } from 'react';
import { ShieldAlert, ArrowDownWideNarrow, Search, X, Users, ChevronDown, AlertTriangle, RefreshCw, CheckCircle2, DollarSign, Archive } from 'lucide-react';
import { SortOption, UserProfile } from '../../types';
import { translateFilter } from '../../utils/translationHelpers';

interface DashboardControlsProps {
    statusFilter: string;
    setStatusFilter: (val: any) => void;
    sortOption: SortOption;
    setSortOption: (val: SortOption) => void;
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    showToast: (msg: string, type?: any) => void;
    staffMembers?: UserProfile[];
    selectedStaffId: string;
    onStaffChange: (id: string) => void;
    isMaster: boolean;
}

export const DashboardControls: React.FC<DashboardControlsProps> = ({
    statusFilter, setStatusFilter, sortOption, setSortOption, searchTerm, setSearchTerm, showToast,
    staffMembers = [], selectedStaffId, onStaffChange, isMaster
}) => {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    // Lógica de arrastar para rolar (Drag to Scroll)
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [dragDistance, setDragDistance] = useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - scrollRef.current.offsetLeft);
        setScrollLeft(scrollRef.current.scrollLeft);
        setDragDistance(0);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Velocidade da rolagem
        scrollRef.current.scrollLeft = scrollLeft - walk;
        setDragDistance(Math.abs(x - startX));
    };

    return (
        <div className="flex flex-col gap-3 relative z-30">
            {/* Seletor de Equipe (Apenas Master) */}
            {isMaster && staffMembers.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/20">
                        <Users size={16}/>
                    </div>
                    <div className="flex-1 relative group">
                        <select 
                            value={selectedStaffId}
                            onChange={e => onStaffChange(e.target.value)}
                            className="w-full appearance-none bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 pr-10 text-[10px] font-black uppercase text-white outline-none focus:border-indigo-500 transition-all cursor-pointer hover:bg-slate-800"
                        >
                            <option value="ALL">Visualizar: Toda a Equipe</option>
                            <optgroup label="Colaboradores">
                                {staffMembers.map(s => (
                                    <option key={s.id} value={s.id}>Operador: {s.name}</option>
                                ))}
                            </optgroup>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-500" size={16}/>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 w-full">
                <div className="flex gap-1.5 flex-shrink-0">
                    <button 
                        onClick={() => { setIsSearchOpen(!isSearchOpen); setIsSortOpen(false); }}
                        className={`p-2.5 rounded-xl border transition-all ${isSearchOpen ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                        title="Buscar"
                    >
                        <Search size={18} />
                    </button>
                    <button 
                        onClick={() => { setIsSortOpen(!isSortOpen); setIsSearchOpen(false); }}
                        className={`p-2.5 rounded-xl border transition-all ${isSortOpen ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                        title="Ordenar"
                    >
                        <ArrowDownWideNarrow size={18} />
                    </button>
                </div>

                <div 
                    ref={scrollRef}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    className={`flex-1 overflow-x-auto no-scrollbar select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}`}
                >
                    <div className="flex gap-2 p-1.5 bg-slate-900/50 border border-slate-800/80 rounded-xl w-max">
                        {[
                          { id: 'TODOS', icon: <Users size={14} className="text-blue-400" /> },
                          { id: 'ATRASADOS', icon: <AlertTriangle size={14} className="text-amber-400" /> },
                          { id: 'ATRASO_CRITICO', icon: <ShieldAlert size={14} className="text-rose-500" /> },
                          { id: 'RENEGOCIADO', icon: <RefreshCw size={14} className="text-purple-400" /> },
                          { id: 'EM_DIA', icon: <CheckCircle2 size={14} className="text-emerald-400" /> },
                          { id: 'PAGOS', icon: <DollarSign size={14} className="text-indigo-400" /> },
                          { id: 'ARQUIVADOS', icon: <Archive size={14} className="text-slate-400" /> }
                        ].map(filter => (
                            <button 
                                key={filter.id} 
                                onClick={(e) => {
                                    // Só altera o filtro se não foi um arraste significativo
                                    if (dragDistance < 5) {
                                        setStatusFilter(filter.id as any);
                                    }
                                }} 
                                className={`p-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center justify-center gap-2 pointer-events-auto min-w-[42px] ${statusFilter === filter.id ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-500 shadow-lg shadow-blue-600/20' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'}`}
                                title={translateFilter(filter.id)}
                            >
                                {filter.icon}
                                <span className="inline">{translateFilter(filter.id)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isSearchOpen && (
                <div className="mt-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-1 animate-in slide-in-from-top-2 duration-200 shadow-2xl shadow-black/50">
                    <div className="pl-3 pr-1 text-emerald-500"><Search size={14}/></div>
                    <input 
                        type="text" 
                        placeholder="BUSCAR POR NOME, CPF/CNPJ..." 
                        className="bg-transparent w-full py-2 px-2 text-white outline-none text-[10px] font-black uppercase tracking-widest placeholder:text-slate-600" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        autoFocus
                    />
                    <button 
                        onClick={() => { setIsSearchOpen(false); setSearchTerm(''); }} 
                        className="p-2.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                        title="Fechar Busca"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {isSortOpen && (
                <div className="absolute top-full left-0 mt-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex flex-col gap-1 animate-in slide-in-from-top-2 duration-200 z-50 w-full md:max-w-[300px] shadow-2xl shadow-black/50">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 mb-1">
                        <ArrowDownWideNarrow size={14} className="text-blue-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Ordenar por</span>
                    </div>
                    {[
                        { id: 'DUE_DATE_ASC', label: 'Vencimento Próximo' },
                        { id: 'NAME_ASC', label: 'Nome (A-Z)' },
                        { id: 'CREATED_DESC', label: 'Entrada (Novo)' },
                        { id: 'UPDATED_DESC', label: 'Alteração (Recente)' }
                    ].map((option) => (
                        <button
                            key={option.id}
                            onClick={() => { setSortOption(option.id as SortOption); setIsSortOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between group ${
                                sortOption === option.id 
                                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent'
                            }`}
                        >
                            {option.label}
                            {sortOption === option.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
