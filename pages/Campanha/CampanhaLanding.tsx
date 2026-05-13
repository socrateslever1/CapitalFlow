import React, { useState, useEffect } from 'react';
import { Campaign } from '../../types';
import { campaignService } from '../../services/campaign.service';
import { maskPhone, maskDocument } from '../../utils/formatters';
import { Loader2, MessageCircle, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CampanhaLandingProps {
  campaignId: string;
}

export const CampanhaLanding: React.FC<CampanhaLandingProps> = ({ campaignId }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', whatsapp: '', cpf: '', value: 0, lgpd: false });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadCampaign = async () => {
      setLoading(true);
      try {
        const data = campaignService.getCampaign(campaignId);
        if (data) {
          setCampaign(data);
          campaignService.trackClick(campaignId);
        }
      } catch (e) {
        console.error('Failed to load campaign', e);
      } finally {
        setLoading(false);
      }
    };
    loadCampaign();
  }, [campaignId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign || !form.name || !form.whatsapp || !form.cpf || !form.value || !form.lgpd) {
        alert('Por favor, preencha todos os campos e aceite os termos.');
        return;
    }

    setSubmitting(true);

    try {
      // 1. Create Lead Session (Backend)
      const sessionToken = await campaignService.createLeadSession(
        campaign.id,
        form.name,
        form.whatsapp,
        form.cpf,
        form.value
      );

      // 2. Redirect to Chat (Part 2)
      window.location.href = `/campanha/chat?session=${sessionToken}&campaign_id=${campaign.id}`;

    } catch (e: any) {
      console.error('Error submitting form', e);
      alert('Erro ao processar solicitação: ' + e.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (!campaign || campaign.status === 'INACTIVE') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl border border-slate-800">
          <AlertTriangle className="mx-auto text-amber-500 mb-4" size={48} />
          <h1 className="text-2xl font-black text-white uppercase mb-2">Campanha Indisponível</h1>
          <p className="text-slate-400 text-sm">Esta campanha não está mais ativa ou não foi encontrada.</p>
        </div>
      </div>
    );
  }

  const FIXED_VALUES = [500, 800, 1000, 1500, 2000];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-blue-600/5 blur-3xl rounded-full pointer-events-none"></div>
      
      <div className="w-full max-w-md relative z-10">
        {campaign.imageUrl && (
          <div className="mb-6 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            <img src={campaign.imageUrl} alt={campaign.name} className="w-full h-auto object-cover" />
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">{campaign.description || campaign.name}</h1>
          <p className="text-slate-400 text-sm font-medium">Simule seu crédito agora mesmo.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome Completo *</label>
              <input 
                type="text" 
                required
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="Seu nome completo"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
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
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">CPF *</label>
              <input 
                type="tel" 
                required
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={e => setForm({...form, cpf: maskDocument(e.target.value)})}
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Valor Desejado *</label>
              <div className="grid grid-cols-3 gap-2">
                {FIXED_VALUES.map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm({...form, value: val})}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                      form.value === val 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    R$ {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
                <label className="flex items-start gap-3 cursor-pointer group">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${form.lgpd ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-700 bg-slate-950 group-hover:border-slate-600'}`}>
                        {form.lgpd && <CheckCircle2 size={12} strokeWidth={4} />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.lgpd} onChange={e => setForm({...form, lgpd: e.target.checked})} />
                    <span className="text-[10px] text-slate-500 leading-tight select-none">
                        Li e concordo com a <span className="text-blue-500 underline">Política de Privacidade</span> e autorizo o contato via WhatsApp.
                    </span>
                </label>
            </div>

            <button 
              type="submit" 
              disabled={submitting || !form.value || !form.lgpd}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="animate-spin" size={16}/> : <><ShieldCheck size={16}/> Simular Agora</>}
            </button>
          </form>
          
          <p className="text-[9px] text-slate-500 text-center mt-6 leading-relaxed">
            Esta é uma simulação. A liberação e condições estão sujeitas à análise e validação cadastral.
          </p>
        </div>
      </div>
    </div>
  );
};
