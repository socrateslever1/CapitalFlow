
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ShieldCheck, FileSignature, Loader2, AlertTriangle, CheckCircle2, Lock, Info, Scale, Gavel, Download, Eraser } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { legalPublicService } from '../../features/legal/services/legalPublic.service';
import { generateConfissaoDividaHTML } from '../../features/legal/templates/ConfissaoDividaTemplate';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { maskDocument } from '../../utils/formatters';

const SignatureCanvasAny: any = SignatureCanvas;

const normalizeRole = (value: string | null | undefined) => {
    const role = String(value || '').trim().toUpperCase();

    if (role === 'DEVEDOR' || role === 'DEBTOR') return 'DEBTOR';
    if (role === 'CREDOR' || role === 'CREDITOR') return 'CREDITOR';
    if (role === 'AVALISTA' || role === 'GUARANTOR') return 'AVALISTA';
    if (role.startsWith('TESTEMUNHA_')) return role.replace('TESTEMUNHA_', 'WITNESS_');
    if (role.startsWith('WITNESS_')) return role;
    if (role === 'TESTEMUNHA' || role === 'WITNESS') return 'WITNESS';

    return role;
};

const resolveRequiredRoles = (snapshot: any) => {
    const requiredRoles = new Set<string>();

    if (snapshot?.debtorName) requiredRoles.add('DEBTOR');
    if (snapshot?.creditorName) requiredRoles.add('CREDITOR');

    const witnesses = Array.isArray(snapshot?.witnesses) ? snapshot.witnesses.filter(Boolean) : [];
    witnesses.forEach((_: any, index: number) => {
        requiredRoles.add(`WITNESS_${index + 1}`);
    });

    if (snapshot?.incluirAvalista && snapshot?.avalistaNome) {
        requiredRoles.add('AVALISTA');
    }

    return Array.from(requiredRoles);
};

const buildRenderedHtml = async (doc: any, auditSignatures: any[] = []) => {
    if (!doc) return '';

    const hasAuditSignatures = Array.isArray(auditSignatures) && auditSignatures.length > 0;
    if (!hasAuditSignatures && doc.snapshot_rendered_html) {
        return doc.snapshot_rendered_html;
    }

    const isV2 = doc.snapshot?.incluirGarantia !== undefined || doc.snapshot?.incluirAvalista !== undefined;
    if (isV2) {
        const { generateConfissaoDividaV2HTML } = await import('../../features/legal/templates/ConfissaoDividaV2Template');
        return generateConfissaoDividaV2HTML(doc.snapshot, doc.id, doc.hash_sha256, auditSignatures);
    }

    return generateConfissaoDividaHTML(doc.snapshot, doc.id, doc.hash_sha256, auditSignatures);
};

export const PublicSignaturePage = () => {
    const [status, setStatus] = useState<'LOADING' | 'READY' | 'SIGNING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [docData, setDocData] = useState<any>(null);
    const [htmlContent, setHtmlContent] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [signatures, setSignatures] = useState<any[]>([]);
    
    // Signer Context
    const [token, setToken] = useState<string | null>(null);
    const [role, setRole] = useState<string>('');
    const [expectedName, setExpectedName] = useState('');
    const [signerDoc, setSignerDoc] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    const sigCanvas = useRef<any>(null);
    const [hasSignature, setHasSignature] = useState(false);

    // ✅ HOOKS MOVE TO TOP (Rules of Hooks compliance)
    const requiredRoles = useMemo(() => resolveRequiredRoles(docData?.snapshot), [docData]);
    const signedRoles = useMemo(
        () => new Set((signatures || []).map((sig) => normalizeRole(sig.role || sig.papel))),
        [signatures]
    );
    const isAlreadySigned = signedRoles.has(normalizeRole(role));
    const isComplete = requiredRoles.length > 0
        ? requiredRoles.every((requiredRole) => signedRoles.has(requiredRole))
        : String(docData?.status_assinatura || '').toUpperCase() === 'ASSINADO';

    useEffect(() => {
        const load = async () => {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('legal_sign');
            const roleParam = params.get('role') || 'DEVEDOR';
            const idxParam = params.get('idx');

            if (!t) {
                setErrorMessage('Token de acesso não fornecido.');
                setStatus('ERROR');
                return;
            }

            setToken(t);

            try {
                const doc = await legalPublicService.fetchDocumentByToken(t);
                setDocData(doc);
                
                let name = '';
                let finalRole = normalizeRole(roleParam);
                const upperRoleParam = String(roleParam).trim().toUpperCase();

                if (upperRoleParam === 'DEVEDOR' || upperRoleParam === 'DEBTOR') {
                    name = doc.snapshot.debtorName;
                    finalRole = 'DEBTOR';
                } else if (upperRoleParam === 'CREDOR' || upperRoleParam === 'CREDITOR') {
                    name = doc.snapshot.creditorName;
                    finalRole = 'CREDITOR';
                } else if (upperRoleParam === 'AVALISTA' || upperRoleParam === 'GUARANTOR') {
                    name = doc.snapshot.avalistaNome || 'Avalista';
                    finalRole = 'AVALISTA';
                } else if (upperRoleParam === 'TESTEMUNHA' || upperRoleParam.startsWith('WITNESS') || upperRoleParam.startsWith('TESTEMUNHA_')) {
                    const witnessRoleIndex = upperRoleParam.match(/(?:WITNESS|TESTEMUNHA)_(\d+)/)?.[1];
                    const idx = Math.max(
                        0,
                        parseInt(idxParam || (witnessRoleIndex ? String(Number(witnessRoleIndex) - 1) : '0'), 10) || 0
                    );
                    const witness = doc.snapshot.witnesses?.[idx];
                    name = witness?.name || 'Testemunha';
                    finalRole = `WITNESS_${idx + 1}`;
                }

                setRole(finalRole);
                setExpectedName(name);
                
                const audit = await legalPublicService.getAuditByToken(t);
                setSignatures(audit.signatures || []);
                
                // ✅ Prioriza HTML pré-renderizado se existir (Motor Jurídico Estável)
                const html = await buildRenderedHtml(doc, audit.signatures || []);
                setHtmlContent(html);
                
                setStatus('READY');
            } catch (e: any) {
                setErrorMessage(e.message);
                setStatus('ERROR');
            }
        };
        load();
    }, []);

    // ✅ Ajusta o tamanho interno do canvas para bater com o CSS (Garante que o traço não fique torto)
    useEffect(() => {
        const resizeCanvas = () => {
            if (sigCanvas.current) {
                const canvas = sigCanvas.current.getCanvas();
                const hasExistingSignature = !sigCanvas.current.isEmpty();
                const signatureData = hasExistingSignature ? sigCanvas.current.toData() : [];
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                const context = canvas.getContext("2d");
                if (!context) return;
                context.scale(ratio, ratio);
                sigCanvas.current.clear();

                if (signatureData.length > 0) {
                    sigCanvas.current.fromData(signatureData);
                    setHasSignature(true);
                } else {
                    setHasSignature(false);
                }
            }
        };

        window.addEventListener("resize", resizeCanvas);
        // Pequeno delay para garantir que o layout carregou
        const timer = setTimeout(resizeCanvas, 500);
        
        return () => {
            window.removeEventListener("resize", resizeCanvas);
            clearTimeout(timer);
        };
    }, [status]);

    const handleSign = async () => {
        if (!token) return;
        setLocalError(null);
        const cleanDoc = signerDoc.replace(/\D/g, '');
        
        if (!cleanDoc) {
            setLocalError("Por favor, informe seu CPF/CNPJ para validação.");
            return;
        }

        if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
            setLocalError("CPF ou CNPJ inválido. Verifique os números informados.");
            return;
        }

        if (!acceptedTerms) {
            setLocalError("Você deve ler e aceitar os termos de assinatura eletrônica.");
            return;
        }

        if (!hasSignature || sigCanvas.current?.isEmpty()) {
            setLocalError("Por favor, desenhe sua assinatura no campo indicado.");
            return;
        }

        setStatus('SIGNING');
        try {
            let ip = '0.0.0.0';
            try { 
                const res = await fetchWithRetry('https://api.ipify.org?format=json', { maxRetries: 1 }); 
                const data = await res.json(); 
                ip = data.ip; 
            } catch(e){}

            const signatureImage = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
            
            // Tenta detectar o dispositivo de forma simples no UserAgent
            const ua = navigator.userAgent;
            let device = "Desktop / Navegador";
            if (/iPhone/.test(ua)) device = "iPhone";
            else if (/iPad/.test(ua)) device = "iPad";
            else if (/Android/.test(ua)) device = "Android Device";
            else if (/Windows Phone/.test(ua)) device = "Windows Phone";

            await legalPublicService.signDocumentPublicly(token, {
                name: expectedName,
                doc: cleanDoc,
                role: role,
                signatureImage: signatureImage
            }, { 
                ip, 
                userAgent: `${device} (${ua.substring(0, 50)}...)` 
            });

            const updatedAudit = await legalPublicService.getAuditByToken(token);
            setSignatures(updatedAudit.signatures || []);

            const nextHtml = await buildRenderedHtml(docData, updatedAudit.signatures || []);
            setHtmlContent(nextHtml);
            setStatus('SUCCESS');
        } catch (e: any) {
            console.error("Erro na assinatura:", e);
            setErrorMessage(e.message || "Ocorreu um erro inesperado ao processar sua assinatura.");
            setStatus('ERROR');
        }
    };

    const clearSignature = () => {
        sigCanvas.current?.clear();
        setHasSignature(false);
    };

    const handleDownload = () => {
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(htmlContent);
            win.document.close();
            setTimeout(() => win.print(), 500);
        }
    };

    const handleExit = () => {
        const params = new URLSearchParams(window.location.search);
        const portal = params.get('portal');
        const portalCode = params.get('portal_code') || params.get('code');

        if (portal && portalCode) {
            const portalParams = new URLSearchParams({
                portal,
                portal_code: portalCode,
            });
            window.location.assign(`/?${portalParams.toString()}`);
            return;
        }

        if (window.opener) {
            window.close();
            return;
        }

        window.location.assign('/');
    };

    if (status === 'LOADING') return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white"><Loader2 className="animate-spin text-indigo-500" size={48}/><p className="font-black uppercase text-xs tracking-widest">Autenticando Título...</p></div>;

    if (status === 'ERROR') return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center max-w-md shadow-2xl">
                <AlertTriangle className="text-rose-500 mx-auto mb-4" size={56}/>
                <h2 className="text-white font-black uppercase text-xl mb-2">Falha na Operação</h2>
                <p className="text-slate-400 text-sm leading-relaxed">{errorMessage}</p>
                <button 
                    onClick={() => window.location.reload()} 
                    className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs hover:bg-indigo-500 transition-all"
                >
                    Tentar Novamente
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row overflow-hidden">
            {/* DOCUMENT VIEW */}
            <div className="flex-1 bg-slate-950 p-2 lg:p-10 overflow-y-auto flex justify-center">
                <div className="w-full max-w-4xl relative group">
                    <div className="absolute -inset-1 bg-gradient-to-b from-indigo-500/20 to-transparent rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                    <div className="relative bg-white shadow-[0_20px_70px_rgba(0,0,0,0.5)] min-h-[1122px] rounded-sm overflow-hidden border border-white/10">
                        {status === 'SIGNING' && (
                            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center">
                                <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 border border-white/10 animate-in zoom-in-95">
                                    <div className="relative">
                                        <Loader2 className="animate-spin text-indigo-500" size={64}/>
                                        <ShieldCheck className="absolute inset-0 m-auto text-white/20" size={24}/>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white font-black uppercase text-xs tracking-[0.3em]">Criptografando</p>
                                        <p className="text-slate-500 text-[9px] font-bold uppercase mt-1">Registrando evidências forenses...</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <iframe 
                            srcDoc={`<html><body style="margin:0;padding:0;background:#fff;">${htmlContent}</body></html>`} 
                            className="w-full h-[1122px] border-none" 
                            title="Contrato View" 
                        />
                    </div>
                    {/* CONFIDENTIALity TAG */}
                    <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
                        <Lock size={12}/>
                        <span className="text-[9px] font-black uppercase tracking-widest">Documento Protegido por Criptografia de Ponta a Ponta</span>
                    </div>
                </div>
            </div>

            {/* SIDEBAR SIGNATURE */}
            <div className="w-full lg:w-[420px] bg-slate-900 border-t lg:border-l border-slate-800 p-6 flex flex-col shadow-2xl z-20 overflow-y-auto">
                <div className="mb-8 flex items-center gap-4">
                    <div className="p-4 bg-indigo-600/20 rounded-2xl text-indigo-500 shadow-inner"><Gavel size={32}/></div>
                    <div>
                        <h1 className="text-white font-black uppercase text-lg leading-none tracking-tighter">Assinatura Digital</h1>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Papel: {role.replace('_', ' ')}</p>
                    </div>
                </div>

                {status === 'SUCCESS' ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 shadow-2xl shadow-emerald-500/20">
                            <CheckCircle2 size={56} />
                        </div>
                        <div>
                            <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Assinatura Registrada!</h2>
                            <p className="text-slate-400 text-sm mt-2">Sua manifestação de vontade foi vinculada ao hash deste documento permanentemente.</p>
                        </div>
                        <button onClick={handleExit} className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs hover:bg-slate-700 transition-all">Encerrar Sessão</button>
                    </div>
                ) : (
                    <div className="space-y-6 flex-1 flex flex-col">
                        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner">
                             <div className="flex items-center gap-3 mb-4">
                               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"/>
                               <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">Identidade Verificada</label>
                             </div>
                              <p className="text-white font-black text-lg uppercase mb-1">{expectedName}</p>
                             <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-4">Documento: {signerDoc ? maskDocument(signerDoc) : 'AGUARDANDO...'}</p>
                             
                             <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Informe seu CPF / CNPJ</label>
                                <input 
                                    value={signerDoc} 
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        if (val.length > 14) val = val.slice(0, 14);
                                        
                                        let masked = val;
                                        if (val.length <= 11) {
                                            masked = val.replace(/(\d{3})(\d)/, '$1.$2')
                                                       .replace(/(\d{3})(\d)/, '$1.$2')
                                                       .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                                        } else {
                                            masked = val.replace(/^(\d{2})(\d)/, '$1.$2')
                                                       .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
                                                       .replace(/\.(\d{3})(\d)/, '.$1/$2')
                                                       .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
                                        }
                                        setSignerDoc(masked);
                                    }} 
                                    className="w-full bg-slate-900 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-white font-bold outline-none transition-all"
                                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                                />
                             </div>
                        </div>

                        {/* SIGNATURE PAD */}
                        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                                    <FileSignature size={12}/> Desenhe sua Assinatura
                                </label>
                                <button 
                                    onClick={clearSignature}
                                    className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-rose-500 rounded-lg transition-all"
                                    title="Limpar Assinatura"
                                >
                                    <Eraser size={14} />
                                </button>
                            </div>
                            
                            <div className="bg-white rounded-xl overflow-hidden h-40 relative border-2 border-slate-800 focus-within:border-indigo-500 transition-all">
                                <SignatureCanvasAny
                                    ref={(ref: any) => { (sigCanvas as any).current = ref; }}
                                    canvasProps={{
                                        className: "signature-canvas w-full h-full",
                                        style: { width: '100%', height: '100%', touchAction: 'none' }
                                    } as any}
                                    onBegin={() => setHasSignature(true)}
                                    onEnd={() => setHasSignature(!(sigCanvas.current?.isEmpty?.() ?? true))}
                                    velocityFilterWeight={0.7}
                                    minWidth={0.5}
                                    maxWidth={2.5}
                                />
                                {!hasSignature && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                        <p className="text-slate-900 font-black uppercase text-[10px] tracking-widest italic">Assine aqui</p>
                                    </div>
                                )}
                            </div>
                            <p className="text-[9px] text-slate-600 font-medium text-center italic">Use o mouse ou o dedo para assinar no campo acima</p>
                        </div>

                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 space-y-4">
                             <div className="flex items-start gap-3">
                                 <input 
                                    type="checkbox" 
                                    id="terms" 
                                    checked={acceptedTerms}
                                    onChange={e => setAcceptedTerms(e.target.checked)}
                                    className="w-5 h-5 mt-0.5 accent-indigo-600 rounded"
                                 />
                                 <label htmlFor="terms" className="text-[11px] text-slate-400 leading-relaxed font-medium select-none">
                                    Declaro que li o documento e aceito assinar eletronicamente conforme a Medida Provisória nº 2.200-2/2001 e a Lei nº 14.063/2020.
                                 </label>
                             </div>
                             <button onClick={() => setShowTerms(true)} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-1"><Info size={10}/> Ler Termos Jurídicos</button>
                        </div>

                        <div className="mt-auto space-y-3">
                            {localError && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-[10px] text-rose-400 font-bold uppercase animate-in fade-in slide-in-from-bottom-2">
                                    <AlertTriangle size={14}/> {localError}
                                </div>
                            )}
                            
                            {isAlreadySigned ? (
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-500">
                                    <CheckCircle2 size={20}/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Você já assinou este documento</span>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleSign}
                                    disabled={!acceptedTerms || !signerDoc || status === 'SIGNING'}
                                    className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase text-xs shadow-2xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                                >
                                    {status === 'SIGNING' ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Processando...
                                        </>
                                    ) : (
                                        <>
                                            <FileSignature size={20}/> Confirmar Assinatura
                                        </>
                                    )}
                                </button>
                            )}

                            <button 
                                onClick={handleDownload}
                                disabled={!isComplete}
                                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 ${isComplete ? 'bg-white text-slate-950 hover:bg-slate-200 shadow-xl' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                            >
                                <Download size={16}/> {isComplete ? 'Baixar PDF Final' : 'Aguardando Assinaturas'}
                            </button>

                            <p className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                IP: DETECTADO • CARIMBO DE TEMPO ATIVO
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* TERMS MODAL */}
            {showTerms && (
                <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <h2 className="text-white font-black uppercase text-lg flex items-center gap-2"><Scale size={20} className="text-indigo-500"/> Termos de Assinatura Eletrônica</h2>
                        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 h-64 overflow-y-auto custom-scrollbar text-xs text-slate-400 leading-relaxed space-y-4">
                            <p><strong>1. VALIDADE:</strong> A assinatura eletrônica aqui realizada tem plena eficácia jurídica e executiva, suprindo a necessidade de assinatura física, conforme Art. 10 da MP 2.200-2/2001.</p>
                            <p><strong>2. INTEGRIDADE:</strong> O documento é selado com hash criptográfico SHA-256. Qualquer alteração posterior invalidará a autenticidade técnica.</p>
                            <p><strong>3. EVIDÊNCIAS:</strong> O sistema registra metadados forenses, incluindo Endereço IP, User Agent do navegador e Carimbo de Tempo (Timestamp) de autoridade certificadora de software.</p>
                            <p><strong>4. RESPONSABILIDADE:</strong> O signatário declara ser o legítimo detentor dos dados informados e assume total responsabilidade pela veracidade de sua manifestação.</p>
                        </div>
                        <button onClick={() => setShowTerms(false)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs">Entendido</button>
                    </div>
                </div>
            )}
        </div>
    );
};
