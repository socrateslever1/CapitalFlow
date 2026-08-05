import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, FileSignature, FileUp, Loader2, RefreshCw, UserPlus, ShieldCheck, Printer, Download, Eye, FileText, Lock, User, Wallet, ArrowRight } from 'lucide-react';
import { clientRegistrationService, ClientRegistrationLinkState } from '../../services/clientRegistration.service';
import { isValidCPF } from '../../utils/validateCPF';
import { maskDocument, maskPhone, formatShortName } from '../../utils/formatters';

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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar cadastro.'); }
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
    const docs = linkState.documents || [];
    const clientInfo = linkState.client || {};

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* MODAL DE BOAS-VINDAS (EXIBIDO APENAS NO PRIMEIRO ACESSO PÓS-APROVAÇÃO) */}
        {!welcomeAccepted && (
          <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/90 p-4 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 size={40} />
              </div>
              <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Cadastro Aprovado com Sucesso
              </span>
              <h1 className="mt-4 text-2xl font-black text-white uppercase tracking-tight">Parabéns! Seu cadastro foi aceito</h1>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Sua conta está liberada. Este mesmo link é seu acesso pessoal e definitivo ao seu Portal do Cliente, onde você consulta seus documentos, contratos e comprovantes.
              </p>
              <button
                type="button"
                onClick={handleAcceptWelcome}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 transition-all cursor-pointer"
              >
                <span>OK, Acessar Meu Portal</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* CABEÇALHO DO PORTAL DO CLIENTE */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 py-3">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-900/30">
                <User size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Portal do Cliente</span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-300">Ativo</span>
                </div>
                <h1 className="truncate text-base font-black text-white uppercase tracking-wide">
                  {clientInfo.name || 'Sua Área do Cliente'}
                </h1>
              </div>
            </div>

            {clientInfo.document && (
              <div className="hidden sm:block text-right">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Documento</p>
                <p className="text-xs font-mono font-bold text-slate-300">{maskDocument(clientInfo.document)}</p>
              </div>
            )}
          </div>
        </header>

        {/* CONTEÚDO PRINCIPAL DO PORTAL */}
        <main className="flex-1 mx-auto max-w-4xl w-full p-4 sm:p-6 space-y-6">
          
          {/* BANNER INFORMATIVO */}
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-indigo-950/30 p-4 sm:p-5 flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white uppercase tracking-wide">Bem-vindo(a) à sua Área Segura</h2>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Este link é pessoal e exclusivo. Aqui você lê e assina sua Confissão de Dívidas, Nota Promissória e acompanha seus contratos e documentos.
              </p>
            </div>
          </div>

          {/* SEÇÃO 1: ÁREA DE DOCUMENTOS (CONFISSÃO DE DÍVIDAS / CONTRATOS) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSignature className="text-indigo-400" size={20} />
                <h2 className="text-sm font-black uppercase tracking-wider text-white">Seus Documentos para Leitura e Assinatura</h2>
              </div>
              <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase">
                {docs.length} documento{docs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {docs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center">
                <FileText className="mx-auto mb-3 text-slate-600" size={36} />
                <h3 className="text-sm font-bold text-slate-300 uppercase">Nenhum documento pendente no momento</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  Sua área de documentos está pronta. Quando seu operador enviar uma Confissão de Dívida ou contrato, ele aparecerá aqui para você ler, assinar ou imprimir.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {docs.map((doc) => {
                  const isSigned = String(doc.status_assinatura).toUpperCase() === 'ASSINADO';
                  const docTitle = doc.tipo === 'PRE_CONTRATO' ? 'Confissão de Dívida / Pré-Contrato' : doc.tipo;

                  return (
                    <div key={doc.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-4 hover:border-slate-700 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div className="flex items-start gap-3">
                          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${isSigned ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                            <FileText size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-black uppercase text-white tracking-wide">{docTitle}</h3>
                            <p className="mt-0.5 text-[10px] text-slate-500 font-bold uppercase">
                              Gerado em {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>

                        <span className={`self-start sm:self-center inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${isSigned ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isSigned ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {isSigned ? 'Assinado com Sucesso' : 'Pendente de Assinatura'}
                        </span>
                      </div>

                      {/* AÇÕES DIRETA NO DOCUMENTO (LER, ASSINAR, IMPRIMIR/PDF) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(doc.view_url || doc.sign_url, '_blank', 'noopener,noreferrer')}
                          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:border-slate-500 hover:bg-slate-800 transition-all"
                        >
                          <Eye size={15} className="text-blue-400" />
                          <span>Ler / Visualizar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => window.open(doc.sign_url || doc.view_url, '_blank', 'noopener,noreferrer')}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-all ${isSigned ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-900/30'}`}
                        >
                          <FileSignature size={15} />
                          <span>{isSigned ? 'Ver Assinatura' : 'Assinar Online'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => window.open(doc.view_url || doc.sign_url, '_blank', 'noopener,noreferrer')}
                          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:border-slate-500 hover:bg-slate-800 transition-all"
                        >
                          <Printer size={15} className="text-emerald-400" />
                          <span>Baixar PDF / Imprimir</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SEÇÃO 2: EMPRÉSTIMOS E CONTRATOS */}
          <section className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Wallet className="text-blue-400" size={20} />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">Seus Empréstimos e Contratos</h2>
            </div>

            {linkState.portalUrl ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300">Contrato Ativo Encontrado</span>
                    <h3 className="mt-1 text-sm font-bold text-white uppercase">Acesse suas parcelas e comprovantes</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.location.assign(linkState.portalUrl!)}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500 transition-all shadow-md"
                  >
                    <span>Abrir Contrato</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
                <Wallet className="mx-auto mb-3 text-slate-600" size={32} />
                <h3 className="text-xs font-bold text-slate-400 uppercase">Nenhum empréstimo ativo no momento</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Sua conta está verificada. Quando um novo contrato for formalizado, suas parcelas, recibos e código PIX para pagamento estarão disponíveis nesta tela.
                </p>
              </div>
            )}
          </section>

        </main>

        {/* RODAPÉ DO PORTAL */}
        <footer className="border-t border-slate-800/80 bg-slate-900/50 py-4 text-center text-[10px] text-slate-500 uppercase tracking-widest">
          CapitalFlow · Portal do Cliente Autenticado
        </footer>
      </div>
    );
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
