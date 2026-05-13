import React, { useState, useEffect } from 'react';
import { Campaign, CampaignLead } from '../../types';
import { campaignService } from '../../services/campaign.service';
import { maskPhone } from '../../utils/formatters';
import { Loader2, MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CampaignLandingPageProps {
  campaignId: string;
}

export const CampaignLandingPage: React.FC<CampaignLandingPageProps> = ({ campaignId }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', whatsapp: '', value: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign || !form.name || !form.whatsapp || !form.value) return;

    setSubmitting(true);

    try {
      // Save lead
      const lead: CampaignLead = {
        id: crypto.randomUUID(),
        campaignId: campaign.id,
        name: form.name,
        whatsapp: form.whatsapp.replace(/\D/g, ''),
        selectedValue: form.value,
        createdAt: new Date().toISOString()
      };
      campaignService.saveLead(lead);

      // Construct WhatsApp message
      const message = campaign.messageTemplate
        .replace('{NOME}', form.name)
        .replace('{VALOR}', form.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
        .replace('{LINK}', window.location.href)
        .replace('{CAMPANHA}', campaign.name);
      
      // Clean phone number
      let phone = form.whatsapp.replace(/\D/g, '');
      // If user didn't include country code (length <= 11), add 55
      if (phone.length <= 11) {
        phone = `55${phone}`;
      }
      
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      
      // Open WhatsApp
      window.open(whatsappUrl, '_blank');
      setSuccess(true);
    } catch (e) {
      console.error('Error submitting form', e);
      alert('Erro ao processar solicitação. Tente novamente.');
    } finally {
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

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center animate-in zoom-in-95">
        <div className="max-w-md w-full bg-slate-900 p-8 rounded-2xl border border-slate-800">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase mb-2">Solicitação Enviada!</h1>
          <p className="text-slate-400 text-sm mb-6">Você será redirecionado para o WhatsApp em instantes.</p>
          <button onClick={() => window.location.reload()} className="text-blue-500 text-xs font-bold uppercase hover:underline">Voltar</button>
        </div>
      </div>
    );
  }

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
          <p className="text-slate-400 text-sm font-medium">Preencha seus dados para simular agora.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Seu Nome *</label>
              <input 
                type="text" 
                required
                className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500 transition-colors text-sm font-bold"
                placeholder="Como gostaria de ser chamado?"
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
              <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Valor Desejado *</label>
              <div className="grid grid-cols-2 gap-2">
                {campaign.values.map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm({...form, value: val})}
                    className={`p-3 rounded-xl border text-sm font-bold transition-all ${
                      form.value === val 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    R$ {val.toLocaleString('pt-BR')}
                  </button>
                ))}
              </div>
            </div>

            <button 
              type="submit" 
              disabled={submitting || !form.value}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="animate-spin" size={16}/> : <><MessageCircle size={16}/> Simular no WhatsApp</>}
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
