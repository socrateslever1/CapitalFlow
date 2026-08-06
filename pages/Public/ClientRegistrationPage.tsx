import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, FileSignature, FileUp, Loader2, RefreshCw, UserPlus, ShieldCheck, Printer, Download, Eye, FileText, Lock, User, Wallet, ArrowRight } from 'lucide-react';
import { clientRegistrationService, ClientRegistrationLinkState } from '../../services/clientRegistration.service';
import { isValidCPF } from '../../utils/validateCPF';
import { maskDocument, maskPhone, formatShortName } from '../../utils/formatters';
import { ClientPortalView } from '../../containers/ClientPortal/ClientPortalView';

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

  // Controle de aceite do modal de Boas-Vindas pós-aprovação
  const [welcomeAccepted, setWelcomeAccepted] = useState<boolean>(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(`cm_welcome_accepted_${token}`) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let active = true;
    const loadLink = () => clientRegistrationService.getLink(token)
      .then((result: ClientRegistrationLinkState) => {
        if (!active) return;
        setLinkState(result);

        // Se o cliente aprovado possui portalToken e portalCode (ou portalUrl), redireciona para o Portal do Cliente oficial
        if ((result?.state === 'APPROVED' || result?.state === 'PORTAL') && result?.portalUrl) {
          window.location.href = result.portalUrl;
        }
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

  const handleAcceptWelcome = () => {
    try {
      localStorage.setItem(`cm_welcome_accepted_${token}`, 'true');
    } catch {}
    setWelcomeAccepted(true);
  };

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
    catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Falha ao enviar cadastro.';
      if (/inscrição já foi enviada/i.test(msg) || /ja foi enviada/i.test(msg)) {
        const updated = await clientRegistrationService.getLink(token).catch(() => null);
        if (updated) {
          setLinkState(updated);
        } else {
          setDone(true);
        }
      } else {
        setError(msg);
      }
    }
    finally { setBusy(false); }
  };

  if (invalid) return <div className="min-h-screen bg-slate-950 grid place-items-center p-5 text-center text-slate-300">Este link de cadastro é inválido ou expirou.</div>;
  if (!linkState) return <div className="min-h-screen bg-slate-950 grid place-items-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;

  // =========================================================================
  // 1. TELA DE REJEIÇÃO
  // =========================================================================
  if (linkState.state === 'REJECTED') {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-5">
        <div className="w-full max-w-sm rounded-xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldCheck size={32} />
          </div>
          <span className="inline-flex rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase text-rose-300">Análise Concluída</span>
          <h1 className="mt-4 text-xl font-bold text-white">Proposta não aprovada</h1>
          <p className="mt-2 text-xs text-slate-400">Agradecemos o envio das suas informações. No momento, a proposta de cadastro não atendeu aos critérios de concessão.</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. CADASTRO APROVADO (PORTAL DO CLIENTE DEFINITIVO)
  // =========================================================================
  if (linkState.state === 'APPROVED' || linkState.state === 'PORTAL') {
    const pToken = linkState.portalToken || token;
    const pCode = linkState.portalCode || token.slice(0, 6);
    return <ClientPortalView initialPortalToken={pToken} initialPortalCode={pCode} />;
  }

  // =========================================================================
  // 3. TELA DE ESPERA / EM ANÁLISE
  // =========================================================================
  if (done || linkState.state === 'SUBMITTED') {
    return (
      <div className="min-h-screen bg-slate-950 grid place-items-center p-5">
        <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-slate-900 p-6 text-center shadow-2xl space-y-4">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <RefreshCw className="animate-spin" size={32} />
          </div>
          <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
            Cadastro em Análise
          </span>
          <h1 className="text-xl font-bold text-white uppercase tracking-tight">Aguarde a análise de crédito</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Seus dados e documentos foram recebidos com sucesso. Assim que a análise for concluída, este mesmo link liberará sua Área do Cliente e seus documentos.
          </p>
          <div className="pt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
            <RefreshCw size={12} className="animate-spin" />
            Atualizando automaticamente
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. FORMULÁRIO DE INSCRIÇÃO / CADASTRO INICIAL
  // =========================================================================
  const input = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-blue-500 transition-all';
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white font-sans">
      <form noValidate onSubmit={submit} className="mx-auto max-w-lg space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <header className="border-b border-slate-800 pb-4">
          <div className="mb-2 flex items-center gap-2 text-blue-400">
            <UserPlus size={20}/>
            <span className="text-xs font-black uppercase tracking-widest">Inscrição de Cliente</span>
          </div>
          <h1 className="text-xl font-bold">Complete seus dados</h1>
          <p className="mt-1 text-xs text-slate-400">Suas informações serão enviadas de forma segura para análise de crédito.</p>
        </header>

        <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3.5 hover:border-blue-500/50 transition-all">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-blue-400">
            {photoPreview ? <img src={photoPreview} className="h-full w-full object-cover" alt="Pré-visualização da foto"/> : <Camera size={24}/>}
          </span>
          <div>
            <p className="text-sm font-bold">Foto de Perfil</p>
            <p className="text-xs text-slate-400">Envie uma foto legível do seu rosto (obrigatória).</p>
          </div>
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
          <p className="text-xs font-bold uppercase text-slate-400">Documentos Obrigatórios</p>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={cpfInIdentity} onChange={(e) => setCpfInIdentity(e.target.checked)} className="rounded bg-slate-950 border-slate-700 text-blue-600"/>
            Meu CPF consta na imagem do novo RG
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500 transition-all">
              <FileUp size={20} className={documents.rg ? 'text-emerald-400' : 'text-slate-400'}/>
              <span className="text-[10px] font-bold uppercase">{documents.rg ? documents.rg.name : (cpfInIdentity ? 'RG com CPF *' : 'RG *')}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, rg: e.target.files?.[0] || null })}/>
            </label>
            {!cpfInIdentity && (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500 transition-all">
                <FileUp size={20} className={documents.cpf ? 'text-emerald-400' : 'text-slate-400'}/>
                <span className="text-[10px] font-bold uppercase">{documents.cpf ? documents.cpf.name : 'CPF *'}</span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, cpf: e.target.files?.[0] || null })}/>
              </label>
            )}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center hover:border-blue-500 transition-all">
              <FileUp size={20} className={documents.residence ? 'text-emerald-400' : 'text-slate-400'}/>
              <span className="text-[10px] font-bold uppercase">{documents.residence ? documents.residence.name : 'Comprovante *'}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocuments({ ...documents, residence: e.target.files?.[0] || null })}/>
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-900/30">
          {busy ? <Loader2 className="animate-spin" size={18}/> : 'Enviar cadastro para análise'}
        </button>
      </form>
    </main>
  );
};
