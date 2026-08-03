import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, UserPlus } from 'lucide-react';
import { clientRegistrationService, ClientRegistrationLinkState } from '../../services/clientRegistration.service';

export const ClientRegistrationPage: React.FC<{ token: string }> = ({ token }) => {
  const [linkState, setLinkState] = useState<ClientRegistrationLinkState | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', document: '', email: '', address: '', city: '', state: '' });

  useEffect(() => {
    let active = true;
    clientRegistrationService.getLink(token)
      .then((result: ClientRegistrationLinkState) => {
        if (!active) return;
        if (result.state === 'PORTAL' && result.portalUrl) {
          window.location.replace(result.portalUrl);
          return;
        }
        setLinkState(result);
      })
      .catch(() => active && setInvalid(true));
    return () => { active = false; };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await clientRegistrationService.submit(token, form, files); setDone(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar cadastro.'); }
    finally { setBusy(false); }
  };

  if (invalid) return <div className="min-h-screen bg-slate-950 grid place-items-center p-5 text-center text-slate-300">Este link de cadastro é inválido ou expirou.</div>;
  if (!linkState) return <div className="min-h-screen bg-slate-950 grid place-items-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (done || linkState.state === 'SUBMITTED') return <div className="min-h-screen bg-slate-950 grid place-items-center p-5"><div className="max-w-sm text-center"><CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={48}/><h1 className="text-xl font-bold text-white">Cadastro em análise</h1><p className="mt-2 text-sm text-slate-400">Seus dados foram recebidos. Quando o crédito for aprovado, este mesmo link abrirá sua área do cliente.</p></div></div>;

  const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500';
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white"><form onSubmit={submit} className="mx-auto max-w-lg space-y-5 rounded-lg border border-slate-800 bg-slate-900 p-5">
    <header className="border-b border-slate-800 pb-4"><div className="mb-2 flex items-center gap-2 text-blue-400"><UserPlus size={20}/><span className="text-xs font-bold uppercase">Cadastro de cliente</span></div><h1 className="text-xl font-bold">Complete seus dados</h1><p className="mt-1 text-xs text-slate-400">As informações serão enviadas com segurança para análise.</p></header>
    <div className="grid gap-3 sm:grid-cols-2"><input className={`${input} sm:col-span-2`} required maxLength={120} placeholder="Nome completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className={input} required maxLength={20} placeholder="WhatsApp com DDD" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><input className={input} required maxLength={18} placeholder="CPF ou CNPJ" value={form.document} onChange={e=>setForm({...form,document:e.target.value})}/><input className={`${input} sm:col-span-2`} type="email" maxLength={160} placeholder="E-mail" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className={`${input} sm:col-span-2`} maxLength={200} placeholder="Endereço" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input className={input} maxLength={100} placeholder="Cidade" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/><input className={input} maxLength={2} placeholder="UF" value={form.state} onChange={e=>setForm({...form,state:e.target.value.toUpperCase()})}/></div>
    <label className="block rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-300"><FileUp className="mx-auto mb-2 text-blue-400"/><span>Identidade, comprovante de residência ou renda</span><input className="mt-3 block w-full text-xs" type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={e=>setFiles(Array.from(e.target.files || []).slice(0,5))}/><small className="mt-2 block text-slate-500">Até 5 arquivos, 5 MB cada. PDF, JPG ou PNG.</small></label>
    {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    <label className="flex items-start gap-2 text-xs text-slate-400"><input required type="checkbox" className="mt-0.5"/>Autorizo o tratamento destes dados para cadastro e análise, conforme a política de privacidade.</label>
    <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={17}/>:<UserPlus size={17}/>}Enviar cadastro</button>
  </form></main>;
};
