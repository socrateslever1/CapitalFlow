
import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Loader2, CheckCircle2, Copy, UserPlus } from 'lucide-react';
import { maskDocument, onlyDigits } from '../../../utils/formatters';
import { InviteResult } from '../types';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (name: string, cpf: string) => void;
  isLoading: boolean;
  result: InviteResult | null;
  resetResult: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ 
  isOpen, onClose, onGenerate, isLoading, result, resetResult 
}) => {
  const [form, setForm] = useState({ name: '', cpf: '' });

  const handleSubmit = () => {
    const cleanCPF = onlyDigits(form.cpf);
    if (!form.name || cleanCPF.length !== 11) return; // Basic validation
    onGenerate(form.name, cleanCPF);
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(`Olá ${result.name}, seu acesso ao sistema está pronto. Clique para entrar: ${result.link}`);
      alert("Link copiado para a área de transferência!");
    }
  };

  const handleClose = () => {
    setForm({ name: '', cpf: '' });
    resetResult();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal onClose={handleClose} title={result ? "Convite Gerado" : "Novo Membro"}>
      {!result ? (
        <div className="space-y-5">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-3 text-slate-400 text-xs leading-relaxed">
             <UserPlus size={20} className="shrink-0 text-blue-500"/>
             <span>O sistema irá gerar um link único. O membro poderá acessar sem senha no primeiro login.</span>
          </div>

          <div className="space-y-4">
            <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome Completo</label>
                <input 
                    placeholder="Ex: Maria Souza" 
                    className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold" 
                    value={form.name || ''} 
                    onChange={e => setForm({...form, name: e.target.value})} 
                />
            </div>
            <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">CPF do Membro</label>
                <input 
                    placeholder="000.000.000-00" 
                    className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold" 
                    value={form.cpf || ''} 
                    onChange={e => setForm({...form, cpf: maskDocument(e.target.value)})} 
                />
            </div>
          </div>

          <button 
            onClick={handleSubmit} 
            disabled={isLoading || !form.name || form.cpf.length < 14} 
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : "Gerar Acesso"}
          </button>
        </div>
      ) : (
        <div className="text-center space-y-6 animate-in zoom-in-95 duration-300">
          <div className="flex justify-center">
             <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 size={40} className="text-emerald-500" />
             </div>
          </div>
          
          <div>
            <h3 className="text-white font-bold text-lg">Tudo pronto para {result.name}!</h3>
            <p className="text-slate-400 text-xs mt-1">Envie o link abaixo para o membro realizar o primeiro acesso.</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 relative group cursor-pointer" onClick={handleCopy}>
             <p className="text-blue-400 text-xs font-mono break-all line-clamp-2">{result.link}</p>
             <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-sm">
                <span className="text-white font-bold text-xs flex items-center gap-2"><Copy size={14}/> Copiar Link</span>
             </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleCopy} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg transition-all">
                <Copy size={16}/> Copiar
            </button>
            <button onClick={handleClose} className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-xs transition-all">
                Concluir
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
