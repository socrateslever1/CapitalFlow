import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, FileSignature, FileUp, Loader2, RefreshCw, UserPlus } from 'lucide-react';
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
    const loadLink = () => clientRegistrationService.getLink(token)
      .then((result: ClientRegistrationLinkState) => {
        if (!active) return;
        setLinkState(result);
      })
      .catch(() => active && setInvalid(true));

    void loadLink();
    const interval = window.setInterval(() => {
      if (active) void loadLink();
    }, 15000);

    return () => { active = false; window.clearInterval(interval); };
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

  if (linkState.state === 'PORTAL' && linkState.portalUrl) {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-5">
        <div className="w-full max-w-sm rounded-lg border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={52}/>
          <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase text-emerald-300">Cadastro aprovado</span>
          <h1 className="mt-4 text-2xl font-bold text-white">Parabéns, seu cadastro foi aceito</h1>
          <p className="mt-2 text-sm text-slate-400">Sua área do cliente está pronta para consulta de contratos, documentos e pagamentos.</p>
          <button type="button" onClick={() => window.location.assign(linkState.portalUrl!)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500">Entrar na área do cliente</button>
        </div>
      </div>
    );
  }

  if (linkState.state === 'DOCUMENTS') {
    const docs = linkState.documents || [];
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-5 text-slate-300">
        <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={48}/>
          <h1 className="text-center text-xl font-bold text-white">Área do cliente</h1>
          <p className="mt-2 text-center text-sm text-slate-400">Seu documento está disponível para leitura e assinatura. Depois que o contrato operacional existir, este mesmo link abrirá o portal completo.</p>
          <div className="mt-5 space-y-3">
            {docs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs font-bold uppercase text-slate-500">
                Sua área está sendo preparada. Esta tela verifica novamente a cada 15 segundos.
              </div>
            ) : docs.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-start gap-3">
                  <FileSignature className="mt-0.5 shrink-0 text-indigo-400" size={18}/>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-white">{doc.tipo === 'PRE_CONTRATO' ? 'Contrato para assinatura' : doc.tipo}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                      {String(doc.status_assinatura).toUpperCase() === 'ASSINADO' ? 'Assinado' : 'Pendente de assinatura'}
                      <span className="mx-1">·</span>
                      {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => window.open(doc.sign_url || doc.view_url, '_blank', 'noopener,noreferrer')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-[10px] font-black uppercase tracking-widest text-white">
                  <ExternalLink size={14}/>
                  {String(doc.status_assinatura).toUpperCase() === 'ASSINADO' ? 'Abrir documento' : 'Ler e assinar'}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <RefreshCw size={12} className="animate-spin"/>
            Verificando contrato
          </div>
        </div>
      </div>
    );
  }

  if (done || linkState.state === 'SUBMITTED') return <div className="min-h-screen bg-slate-950 grid place-items-center p-5"><div className="max-w-sm text-center"><CheckCircle2 className="mx-auto mb-4 text-amber-400" size={48}/><span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase text-amber-300">Em análise</span><h1 className="mt-3 text-xl font-bold text-white">Aguarde o término da análise</h1><p className="mt-2 text-sm text-slate-400">Seus dados foram recebidos. Quando o crédito for aprovado, este mesmo link abrirá sua área do cliente.</p></div></div>;

  if (linkState.state === 'APPROVED') {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-5 text-slate-300">
        <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-400" size={48}/>
          <h1 className="text-center text-xl font-bold text-white">Parabéns, seu cadastro foi aceito</h1>
          <p className="mt-2 text-center text-sm text-slate-400">Sua área está sendo preparada. Assim que um documento ou contrato for enviado, este mesmo link será atualizado automaticamente.</p>
          <div className="mt-5 rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs font-bold uppercase text-slate-500">
            Esta tela verifica novamente a cada 15 segundos.
          </div>
        </div>
      </div>
    );
  }

  const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500';
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white"><form noValidate onSubmit={submit} className="mx-auto max-w-lg space-y-5 rounded-lg border border-slate-800 bg-slate-900 p-5">
    <header className="border-b border-slate-800 pb-4"><div className="mb-2 flex items-center gap-2 text-blue-400"><UserPlus size={20}/><span className="text-xs font-bold uppercase">Cadastro de cliente</span></div><h1 className="text-xl font-bold">Complete seus dados</h1><p className="mt-1 text-xs text-slate-400">As informações serão enviadas com segurança para análise.</p></header>
    <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-blue-400">
        {photoPreview ? <img src={photoPreview} className="h-full w-full object-cover" alt="Pre-visualizacao da foto"/> : <Camera size={24}/>}
      </span>
      <div><p className="text-sm font-bold">Foto de perfil</p><p className="text-xs text-slate-400">Envie uma foto legível do seu rosto (obrigatória).</p></div>
      <input type="file" accept="image/*" className="hidden" onChange={(event) => setProfilePhoto(event.target.files?.[0] || null)}/>
    </label>
    <div className="space-y-3">
      <input className={input} placeholder="Nome completo *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={input} placeholder="WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/>
        <input className={input} placeholder="CPF *" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })}/>
      </div>
      <input className={input} type="email" placeholder="E-mail *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/>
      <input className={input} placeholder="Endereço completo *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}/>
      <div className="grid grid-cols-3 gap-3">
        <input className={`${input} col-span-2`} placeholder="Cidade *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}/>
        <input className={input} maxLength={2} placeholder="UF *" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}/>
      </div>
    </div>
    <div className="space-y-3 border-t border-slate-800 pt-4">
      <p className="text-xs font-bold uppercase text-slate-400">Documentos obrigatórios</p>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={cpfInIdentity} onChange={(e) => setCpfInIdentity(e.target.checked)} className="rounded bg-slate-950 border-slate-700"/>
        Meu CPF já constará na imagem do meu novo RG
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500">
          <FileUp size={20} className={documents.rg ? 'text-emerald-400' : 'text-slate-400'}/>
          <span className="text-[10px] font-bold uppercase">{documents.rg ? documents.rg.name : (cpfInIdentity ? 'RG com CPF *' : 'RG *')}</span>
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, rg: e.target.files?.[0] || null })}/>
        </label>
        {!cpfInIdentity && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500">
            <FileUp size={20} className={documents.cpf ? 'text-emerald-400' : 'text-slate-400'}/>
            <span className="text-[10px] font-bold uppercase">{documents.cpf ? documents.cpf.name : 'CPF *'}</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, cpf: e.target.files?.[0] || null })}/>
          </label>
        )}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500">
          <FileUp size={20} className={documents.residence ? 'text-emerald-400' : 'text-slate-400'}/>
          <span className="text-[10px] font-bold uppercase">{documents.residence ? documents.residence.name : 'Comprovante *'}</span>
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, residence: e.target.files?.[0] || null })}/>
        </label>
      </div>
    </div>
    {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
    <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
      {busy ? <Loader2 className="animate-spin" size={18}/> : 'Enviar cadastro para análise'}
    </button>
  </form></main>;
};
