import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, FileUp, Loader2, UserPlus } from 'lucide-react';
import { clientRegistrationService, ClientRegistrationLinkState } from '../../services/clientRegistration.service';
import { isValidCPF } from '../../utils/validateCPF';

export const ClientRegistrationPage: React.FC<{ token: string }> = ({ token }) => {
  const [linkState, setLinkState] = useState<ClientRegistrationLinkState | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<{ rg: File | null; cpf: File | null; residence: File | null }>({ rg: null, cpf: null, residence: null });
  const [cpfInIdentity, setCpfInIdentity] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', document: '', email: '', address: '', city: '', state: '' });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const refreshLink = () => clientRegistrationService.getLink(token)
      .then((result: ClientRegistrationLinkState) => {
        if (!active) return;
        setLinkState(result);
        if (result.state === 'SUBMITTED' || result.state === 'APPROVED') {
          timer = window.setTimeout(refreshLink, 15000);
        }
      })
      .catch(() => active && setInvalid(true));
    void refreshLink();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [token]);

  useEffect(() => {
    if (!profilePhoto) { setPhotoPreview(''); return; }
    const preview = URL.createObjectURL(profilePhoto);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [profilePhoto]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    const missingInformation = [
      !form.name.trim() && 'nome completo',
      !form.phone.trim() && 'WhatsApp',
      !form.document.trim() && 'CPF',
      !form.email.trim() && 'e-mail',
      !form.address.trim() && 'endereço',
      !form.city.trim() && 'cidade',
      form.state.trim().length !== 2 && 'UF',
    ].filter(Boolean) as string[];
    const missingDocuments = [
      !documents.rg && 'RG',
      !cpfInIdentity && !documents.cpf && 'CPF',
      !documents.residence && 'comprovante de residência',
    ].filter(Boolean) as string[];
    const missingParts = [
      missingInformation.length > 0 && `informação: ${missingInformation.join(', ')}`,
      missingDocuments.length > 0 && `documento: ${missingDocuments.join(', ')}`,
      !profilePhoto && 'foto de perfil',
    ].filter(Boolean);
    if (missingParts.length > 0) {
      setError(`Não foi possível enviar. Falta ${missingParts.join('; ')}.`);
      setBusy(false);
      return;
    }
    if (!isValidCPF(form.document)) { setError('Informe um CPF verdadeiro e válido.'); setBusy(false); return; }
    if (!profilePhoto) { setError('A foto de perfil é obrigatória.'); setBusy(false); return; }
    if (!documents.rg || (!cpfInIdentity && !documents.cpf) || !documents.residence) { setError('Envie RG, CPF e comprovante de residência, ou indique que o CPF consta no novo RG.'); setBusy(false); return; }
    try {
      await clientRegistrationService.submit(token, form, {
        rg: documents.rg,
        cpf: documents.cpf,
        residence: documents.residence,
        cpfInIdentity,
      }, profilePhoto);
      setDone(true);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar cadastro.'); }
    finally { setBusy(false); }
  };

  if (invalid) return <div className="min-h-screen bg-slate-950 grid place-items-center p-5 text-center text-slate-300">Este link de cadastro é inválido ou expirou.</div>;
  if (!linkState) return <div className="min-h-screen bg-slate-950 grid place-items-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (linkState.state === 'PORTAL' && linkState.portalUrl) return <div className="min-h-screen bg-slate-950 grid place-items-center p-5"><div className="w-full max-w-sm rounded-lg border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl"><CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={52}/><span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">Cadastro aprovado</span><h1 className="mt-4 text-2xl font-bold text-white">Parabéns, seu cadastro foi aceito</h1><p className="mt-2 text-sm text-slate-400">Sua área do cliente está pronta para consulta de contratos, documentos e pagamentos.</p><button type="button" onClick={() => window.location.assign(linkState.portalUrl!)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500">Entrar na área do cliente</button></div></div>;
  if (linkState.state === 'APPROVED') return <div className="min-h-screen bg-slate-950 grid place-items-center p-5"><div className="w-full max-w-sm rounded-lg border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl"><CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={52}/><span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">Cadastro aprovado</span><h1 className="mt-4 text-2xl font-bold text-white">Parabéns, seu cadastro foi aceito</h1><p className="mt-2 text-sm text-slate-400">Sua área do cliente está sendo preparada. Este mesmo link liberará seus contratos e documentos assim que estiverem disponíveis.</p><div className="mt-5 flex items-center justify-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="animate-spin" size={14}/> Aguardando documentos</div></div></div>;
  if (done || linkState.state === 'SUBMITTED') return <div className="min-h-screen bg-slate-950 grid place-items-center p-5"><div className="max-w-sm text-center"><CheckCircle2 className="mx-auto mb-4 text-amber-400" size={48}/><span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase text-amber-300">Em análise</span><h1 className="mt-3 text-xl font-bold text-white">Aguarde o término da análise</h1><p className="mt-2 text-sm text-slate-400">Seus dados foram recebidos. Quando o crédito for aprovado, este mesmo link abrirá sua área do cliente.</p></div></div>;

  const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500';
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white"><form noValidate onSubmit={submit} className="mx-auto max-w-lg space-y-5 rounded-lg border border-slate-800 bg-slate-900 p-5">
    <header className="border-b border-slate-800 pb-4"><div className="mb-2 flex items-center gap-2 text-blue-400"><UserPlus size={20}/><span className="text-xs font-bold uppercase">Cadastro de cliente</span></div><h1 className="text-xl font-bold">Complete seus dados</h1><p className="mt-1 text-xs text-slate-400">As informações serão enviadas com segurança para análise.</p></header>
    <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-blue-400">
        {photoPreview ? <img src={photoPreview} className="h-full w-full object-cover" alt="Pre-visualizacao da foto"/> : <Camera size={24}/>}
      </span>
      <span className="min-w-0"><strong className="block text-sm text-white">Foto de perfil</strong><small className="block text-xs text-slate-400">JPG ou PNG, até 5 MB.</small></span>
      <input required className="sr-only" type="file" accept="image/jpeg,image/png" onChange={e=>setProfilePhoto(e.target.files?.[0] || null)}/>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <input name="full-name" autoComplete="name" className={`${input} sm:col-span-2`} required maxLength={120} placeholder="Nome completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value.replace(/\s{2,}/g, ' ')})}/>
      <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" className={input} required maxLength={20} placeholder="WhatsApp com DDD" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value.replace(/[^\d()+\-\s]/g, '')})}/>
      <input name="cpf" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} aria-label="CPF" className={input} required minLength={11} maxLength={14} placeholder="CPF" value={form.document} onChange={e=>setForm({...form,document:e.target.value.replace(/[^\d.-]/g, '')})}/>
      <input name="email" autoComplete="email" className={`${input} sm:col-span-2`} type="email" inputMode="email" required maxLength={160} placeholder="E-mail" value={form.email} onChange={e=>setForm({...form,email:e.target.value.trimStart()})}/>
      <input name="street-address" autoComplete="street-address" className={`${input} sm:col-span-2`} required maxLength={200} placeholder="Endereço" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
      <input name="address-level2" autoComplete="address-level2" className={input} required maxLength={100} placeholder="Cidade" value={form.city} onChange={e=>setForm({...form,city:e.target.value.replace(/\s{2,}/g, ' ')})}/>
      <input name="address-level1" autoComplete="address-level1" className={input} required minLength={2} maxLength={2} placeholder="UF" value={form.state} onChange={e=>setForm({...form,state:e.target.value.replace(/[^a-z]/gi, '').toUpperCase()})}/>
    </div>
    <fieldset className="space-y-3 rounded-lg border border-slate-700 p-4">
      <legend className="px-2 text-xs font-bold uppercase text-slate-300">Documentos obrigatórios</legend>
      {([
        ['rg', 'RG'],
      ] as const).map(([key, label]) => (
        <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
          <FileUp className="shrink-0 text-blue-400" size={18}/>
          <span className="min-w-0 flex-1"><strong className="block text-xs text-white">{label}</strong><small className="block truncate text-[10px] text-slate-500">{documents[key]?.name || 'PDF, JPG ou PNG - até 5 MB'}</small></span>
          <input required className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setDocuments(current => ({ ...current, [key]: e.target.files?.[0] || null }))}/>
        </label>
      ))}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
        <input type="checkbox" checked={cpfInIdentity} onChange={(event) => { setCpfInIdentity(event.target.checked); if (event.target.checked) setDocuments(current => ({ ...current, cpf: null })); }} className="mt-0.5 h-4 w-4 accent-blue-500"/>
        <span><strong className="block text-white">CPF consta no novo RG</strong><small className="mt-0.5 block text-blue-300/80">Marque quando RG e CPF estiverem no mesmo documento.</small></span>
      </label>
      {!cpfInIdentity && (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
          <FileUp className="shrink-0 text-blue-400" size={18}/>
          <span className="min-w-0 flex-1"><strong className="block text-xs text-white">CPF</strong><small className="block truncate text-[10px] text-slate-500">{documents.cpf?.name || 'PDF, JPG ou PNG - até 5 MB'}</small></span>
          <input required className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setDocuments(current => ({ ...current, cpf: e.target.files?.[0] || null }))}/>
        </label>
      )}
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
        <FileUp className="shrink-0 text-blue-400" size={18}/>
        <span className="min-w-0 flex-1"><strong className="block text-xs text-white">Comprovante de residência</strong><small className="block truncate text-[10px] text-slate-500">{documents.residence?.name || 'PDF, JPG ou PNG - até 5 MB'}</small></span>
        <input required className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>setDocuments(current => ({ ...current, residence: e.target.files?.[0] || null }))}/>
      </label>
    </fieldset>
    {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    <label className="flex items-start gap-2 text-xs text-slate-400"><input required type="checkbox" className="mt-0.5"/>Autorizo o tratamento destes dados para cadastro e análise, conforme a política de privacidade.</label>
    <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={17}/>:<UserPlus size={17}/>}Enviar cadastro</button>
  </form></main>;
};
