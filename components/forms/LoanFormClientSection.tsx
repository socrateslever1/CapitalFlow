
import React from 'react';
import { Users, Search, ChevronDown } from 'lucide-react';
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
  const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  const inputClass = "block w-full min-w-0 h-14 bg-slate-950/50 border border-slate-800/80 rounded-lg px-4 sm:px-5 text-white text-sm leading-none outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all";

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-2"><Users className="w-4 h-4" /> Devedor</h3>
      <div className="space-y-4">

        {/* Dropdown Elegante */}
        <div className="relative group">
            <select
                value={formData.clientId || ''}
                onChange={e => handleClientSelect(e.target.value)}
                className={`${inputClass} appearance-none pr-10 cursor-pointer hover:bg-slate-900/50`}
            >
                <option value="">-- Selecionar ou Criar --</option>
                {sortedClients.map(c => <option key={c.id} value={c.id}>{capitalizeName(c.name)}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-blue-500 transition-colors" size={18} />
        </div>

        <input
            required
            type="text"
            value={formData.debtorName || ''}
            onChange={e => setFormData({...formData, debtorName: e.target.value})}
            onBlur={e => setFormData({...formData, debtorName: capitalizeName(e.target.value)})}
            className={inputClass}
            placeholder="Nome Completo"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_56px] gap-2">
          <input required type="tel" value={formData.debtorPhone || ''} onChange={e => setFormData({...formData, debtorPhone: maskPhone(e.target.value)})} className={inputClass} placeholder="WhatsApp" />
          <button type="button" onClick={handlePickContact} className="h-14 w-14 bg-slate-950/50 border border-slate-800/80 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all flex items-center justify-center"><Search className="w-5 h-5" /></button>
        </div>
        <input type="text" value={formData.debtorDocument || ''} onChange={e => setFormData({...formData, debtorDocument: maskDocument(e.target.value)})} className={inputClass} placeholder="CPF/CNPJ" />
      </div>
    </div>
  );
};
