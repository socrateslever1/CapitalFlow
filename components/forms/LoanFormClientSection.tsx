
import React, { useState, useRef, useEffect } from 'react';
import { Users, Search, ChevronDown, UserPlus } from 'lucide-react';
import { Client } from '../../types';
import { maskPhone, maskDocument, capitalizeName } from '../../utils/formatters';

interface LoanFormClientSectionProps {
  clients: Client[];
  formData: any;
  setFormData: any;
  handleClientSelect: (id: string) => void;
  handlePickContact: () => void;
}

export const LoanFormClientSection: React.FC<LoanFormClientSectionProps> = ({
  clients, formData, setFormData, handleClientSelect, handlePickContact
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTerm = (formData.debtorName || '').toLowerCase();
  const filteredClients = searchTerm.length > 0
    ? clients.filter(c => c.name.toLowerCase().includes(searchTerm)).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const inputClass = "block w-full min-w-0 h-14 bg-slate-950/50 border border-slate-800/80 rounded-lg px-4 sm:px-5 text-white text-sm leading-none outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all";

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-2"><Users className="w-4 h-4" /> Devedor</h3>
      <div className="space-y-4">

        {/* Dropdown de Clientes (Menu Antigo) */}
        <div className="relative group">
            <select
                value={formData.clientId || ''}
                onChange={e => handleClientSelect(e.target.value)}
                className={`${inputClass} appearance-none pr-10 cursor-pointer hover:bg-slate-900/50`}
            >
                <option value="">-- Selecionar ou Criar --</option>
                {clients.sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{capitalizeName(c.name)}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={18} />
        </div>

        {/* Autocomplete / Input de Nome */}
        <div className="relative" ref={containerRef}>
            <input
                required
                type="text"
                value={formData.debtorName || ''}
                onChange={e => {
                    setFormData({...formData, debtorName: e.target.value, clientId: ''});
                    setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={e => {
                    // Timeout allows click on suggestion to process before hiding
                    setTimeout(() => setFormData((prev: any) => ({...prev, debtorName: capitalizeName(e.target.value)})), 200);
                }}
                className={inputClass}
                placeholder="Nome Completo"
                autoComplete="off"
            />
            
            {/* Lista de Sugestões */}
            {showSuggestions && filteredClients.length > 0 && formData.debtorName && (
                <div className="absolute z-[100] w-full mt-2 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar backdrop-blur-xl">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 py-2 border-b border-slate-800/50 bg-slate-900/50 sticky top-0">
                        Clientes Encontrados ({filteredClients.length})
                    </div>
                    {filteredClients.map(c => (
                        <div 
                            key={c.id} 
                            className="px-4 py-3 hover:bg-blue-600/10 cursor-pointer text-sm text-slate-200 border-b border-slate-800/50 last:border-0 transition-colors flex items-center justify-between group"
                            onClick={() => {
                                handleClientSelect(c.id);
                                setShowSuggestions(false);
                            }}
                        >
                            <div>
                                <div className="font-bold group-hover:text-blue-400 transition-colors">{capitalizeName(c.name)}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{c.phone ? maskPhone(c.phone) : ''} {c.document ? `• ${maskDocument(c.document)}` : ''}</div>
                            </div>
                            <UserPlus className="w-4 h-4 text-slate-600 group-hover:text-blue-500 transition-colors" />
                        </div>
                    ))}
                </div>
            )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_56px] gap-2">
          <input required type="tel" value={formData.debtorPhone || ''} onChange={e => setFormData({...formData, debtorPhone: maskPhone(e.target.value)})} className={inputClass} placeholder="WhatsApp" />
          <button type="button" onClick={handlePickContact} className="h-14 w-14 bg-slate-950/50 border border-slate-800/80 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all flex items-center justify-center"><Search className="w-5 h-5" /></button>
        </div>
        <input type="text" value={formData.debtorDocument || ''} onChange={e => setFormData({...formData, debtorDocument: maskDocument(e.target.value)})} className={inputClass} placeholder="CPF/CNPJ" />
      </div>
    </div>
  );
};
