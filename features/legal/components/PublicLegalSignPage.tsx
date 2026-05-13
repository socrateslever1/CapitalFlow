
import React, { useEffect, useState } from 'react';
import { ShieldCheck, FileSignature, Loader2, AlertTriangle, CheckCircle2, Lock, CheckSquare, Info, Scale, Gavel, UserCheck } from 'lucide-react';
import { legalPublicService } from '../services/legalPublic.service';
import { generateConfissaoDividaHTML } from '../templates/ConfissaoDividaTemplate';
import { maskDocument } from '../../../utils/formatters';
import { fetchWithRetry } from '../../../utils/fetchWithRetry';

interface PublicLegalSignPageProps {
    token: string;
}

export const PublicLegalSignPage: React.FC<PublicLegalSignPageProps> = ({ token }) => {
    const [status, setStatus] = useState<'LOADING' | 'READY' | 'SIGNING' | 'SUCCESS' | 'ERROR'>('LOADING');
    const [docData, setDocData] = useState<any>(null);
    const [htmlContent, setHtmlContent] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    
    // Signer Context
    const [role, setRole] = useState<string>('');
    const [expectedName, setExpectedName] = useState('');
    const [signerDoc, setSignerDoc] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const roleParam = params.get('role') || 'DEVEDOR';
                const idxParam = params.get('idx');

                const doc = await legalPublicService.fetchDocumentByToken(token);
                setDocData(doc);
                
                let name = '';
                let finalRole = roleParam;

                if (roleParam === 'DEVEDOR') {
                    name = doc.snapshot.debtorName;
                } else if (roleParam === 'TESTEMUNHA') {
                    const idx = parseInt(idxParam || '0');
                    const witness = doc.snapshot.witnesses?.[idx];
                    name = witness?.name || 'Testemunha';
                    finalRole = `TESTEMUNHA_${idx + 1}`;
                }

                setRole(finalRole);
                setExpectedName(name);
                
                const audit = await legalPublicService.getAuditByToken(token);
                const html = generateConfissaoDividaHTML(doc.snapshot, doc.id, doc.hash_sha256, audit.signatures);
                setHtmlContent(html);
                setStatus('READY');
            } catch (e: any) {
                setErrorMessage(e.message);
                setStatus('ERROR');
            }
        };
        load();
    }, [token]);

    const handleSign = async () => {
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

        setStatus('SIGNING');
        try {
            let ip = '0.0.0.0';
            try { 
                const res = await fetchWithRetry('https://api.ipify.org?format=json', { maxRetries: 1 }); 
                const data = await res.json(); 
                ip = data.ip; 
            } catch(e){}

            await legalPublicService.signDocumentPublicly(token, {
                name: expectedName,
                doc: cleanDoc, // Envia apenas números
                role: role
            }, { ip, userAgent: navigator.userAgent });
            
            setStatus('SUCCESS');
        } catch (e: any) {
            console.error("Erro na assinatura:", e);
            setErrorMessage(e.message || "Ocorreu um erro inesperado ao processar sua assinatura.");
            setStatus('ERROR');
        }
    };

    if (status === 'LOADING') return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white"><Loader2 className="animate-spin text-blue-500" size={48}/><p className="font-black uppercase text-xs tracking-widest">Autenticando Título...</p></div>;

    if (status === 'ERROR') return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="bg-rose-900/20 border border-rose-500 p-8 rounded-2xl text-center max-w-md shadow-2xl">
                <AlertTriangle className="text-rose-500 mx-auto mb-4" size={56}/>
                <h2 className="text-white font-black uppercase text-xl mb-2">Falha na Operação</h2>
                <p className="text-rose-200 text-sm leading-relaxed">{errorMessage}</p>
                <button 
                    onClick={() => window.location.reload()} 
                    className="mt-6 px-6 py-3 bg-rose-600 text-white rounded-xl font-black uppercase text-xs hover:bg-rose-500 transition-all"
                >
                    Tentar Novamente
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row overflow-hidden">
            {/* DOCUMENT VIEW */}
            <div className="flex-1 bg-slate-900 p-2 lg:p-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto bg-white shadow-2xl min-h-[900px] rounded-lg overflow-hidden relative">
                    {status === 'SIGNING' && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                            <div className="bg-slate-900 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center gap-4 border border-slate-800 animate-in zoom-in-95">
                                <Loader2 className="animate-spin text-indigo-500" size={48}/>
                                <p className="text-white font-black uppercase text-[10px] tracking-[0.2em]">Processando Assinatura...</p>
                            </div>
                        </div>
                    )}
                    <iframe srcDoc={htmlContent} className="w-full h-[900px] border-none" title="Contrato View" />
                </div>
            </div>

            {/* SIDEBAR SIGNATURE */}
            <div className="w-full lg:w-[420px] bg-slate-900 border-t lg:border-l border-slate-800 p-6 flex flex-col shadow-2xl z-20">
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
                        <button onClick={() => window.close()} className="w-full py-5 bg-slate-800 text-white rounded-2xl font-black uppercase text-xs hover:bg-slate-700 transition-all">Encerrar Sessão</button>
                    </div>
                ) : (
                    <div className="space-y-6 flex-1 flex flex-col">
                        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                             <label className="text-[10px] font-black text-slate-500 uppercase block mb-2 flex items-center gap-2"><UserCheck size={12}/> Confirmar Identidade</label>
                             <p className="text-white font-black text-base uppercase mb-4">{expectedName}</p>
                             
                             <div className="space-y-1">
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
