import React, { useState } from 'react';
import { leadsService } from '../services/leads.service';
import { maskPhone } from '../utils/formatters';
import { Loader2, CheckCircle2, DollarSign, MessageCircle } from 'lucide-react';

export const PublicLoanLeadPage: React.FC = () => {
  const [form, setForm] = useState({ nome: '', whatsapp: '', valor: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.whatsapp || !form.valor) return;

    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      await leadsService.insertLead({
        nome: form.nome,
        whatsapp: form.whatsapp.replace(/\D/g, ''),
        valor_solicitado: parseFloat(form.valor.replace(',', '.')),
        status: 'NOVO',
        origem: 'PUBLIC_PAGE',
        utm_source: params.get('utm_source') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined
      });
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center animate-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase mb-2">Solicitação Recebida!</h2>
          <p className="text-slate-400 text-sm mb-6">Nossa equipe entrará em contato pelo WhatsApp em instantes.</p>
          <button onClick={() => window.location.reload()} className="text-blue-500 text-xs font-bold uppercase hover:underline">Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-blue-600/5 blur-3xl rounded-full pointer-events-none"></div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Empréstimo <span className="text-blue-500">Rápido</span></h1>
          <p className="text-slate-400 text-sm font-medium">Dinheiro na conta hoje, sem burocracia.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="bg-slate-950 rounded-2xl p-4 mb-6 border border-slate-800 flex items-center justify-between">
             <div>
               <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Valor Disponível Hoje</p>
               <p className="text-2xl font-black text-emerald-400">R$ 50.000,00</p>
             </div>
             <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
               <DollarSign size={24}/>
             </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Seu Nome (Opcional)</label>
              <input 
                type="text" 
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="Como gostaria de ser chamado?"
                value={form.nome}
                onChange={e => setForm({...form, nome: e.target.value})}
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">WhatsApp *</label>
              <input 
                type="tel" 
                required
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="(00) 00000-0000"
                value={form.whatsapp}
                onChange={e => setForm({...form, whatsapp: maskPhone(e.target.value)})}
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Valor Desejado (R$) *</label>
              <input 
                type="number" 
                required
                step="50"
                min="100"
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="Ex: 1500"
                value={form.valor}
                onChange={e => setForm({...form, valor: e.target.value})}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all mt-4"
            >
              {loading ? <Loader2 className="animate-spin" size={16}/> : <><MessageCircle size={16}/> Solicitar Agora</>}
            </button>
          </form>
          
          <p className="text-[10px] text-slate-500 text-center mt-6">
            Seus dados estão seguros. Ao enviar, você concorda em receber contato via WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
};
