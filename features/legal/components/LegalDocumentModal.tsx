
import React, { useState, useEffect } from 'react';
import { Modal } from "../../../components/ui/Modal";
import { Agreement, Loan, UserProfile, LegalDocumentRecord } from "../../../types";
import { generateConfissaoDividaHTML } from "../templates/ConfissaoDividaTemplate";
import { legalService } from "../services/legalService";
import { safeUUID } from "../../../utils/uuid";
import { Printer, Scale, FileSignature, Loader2, ShieldCheck, Check, FileText, Activity, Users, User, Copy, MessageSquare, Link } from "lucide-react";
import { LegalReportView } from './LegalReportView';

interface LegalDocumentModalProps {
    agreement: Agreement;
    loan: Loan;
    activeUser: UserProfile;
    onClose: () => void;
}

export const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({ agreement, loan, activeUser, onClose }) => {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSigning, setIsSigning] = useState(false);
    const [docRecord, setDocRecord] = useState<LegalDocumentRecord | null>(null);
    const [viewMode, setViewMode] = useState<'DOC' | 'SIGNATURES' | 'REPORT'>('DOC');
    const [fullAuditData, setFullAuditData] = useState<any>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const params = legalService.prepareDocumentParams(agreement, loan, activeUser);
            const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
            if (!ownerId) {
                console.error("ID do usuário inválido para geração de documento.");
                return;
            }
            const record = await legalService.generateAndRegisterDocument(agreement.id, params, ownerId);
            setDocRecord(record);

            const auditData = await legalService.getFullAuditData(record.id);
            setFullAuditData(auditData);

            const html = generateConfissaoDividaHTML(params, record.id, record.hashSHA256, auditData.signatures);
            setHtmlContent(html);
        } catch (e) {
            console.error("Erro ao carregar dados jurídicos:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [agreement.id, loan.id, activeUser.id]);

    const handleSignAsCreditor = async () => {
        if (!docRecord) return;
        if (!confirm("Confirmar sua assinatura como CREDOR(A)? Seus dados técnicos e IP serão vinculados ao título.")) return;
        
        setIsSigning(true);
        try {
            await legalService.signDocument(docRecord.id, activeUser.id, {
                name: activeUser.fullName || activeUser.name,
                doc: activeUser.document || 'N/A'
            }, 'CREDOR');
            await loadData();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSigning(false);
        }
    };

    const getLinkForRole = (role: string, index?: number) => {
        if (!docRecord) return '';
        const baseUrl = window.location.origin;
        let url = `${baseUrl}/?legal_sign=${docRecord.public_access_token}&role=${role}`;
        if (index !== undefined) url += `&idx=${index}`;
        return url;
    };

    const copyLink = (role: string, index?: number) => {
        const url = getLinkForRole(role, index);
        navigator.clipboard.writeText(url);
        setCopiedKey(`${role}${index ?? ''}`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const sendZapNotification = (role: string, name: string, index?: number) => {
        const url = getLinkForRole(role, index);
        const phone = role === 'DEVEDOR' ? loan.debtorPhone.replace(/\D/g, '') : '';
        const text = `Olá *${name}*, solicito sua assinatura digital no Título Executivo ID ${docRecord?.id.substring(0,8)}. Acesse o link seguro para assinar: ${url}`;
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const getSignatureStatus = (role: string) => {
        return fullAuditData?.signatures?.find((s: any) => s.role === role);
    };

    return (
        <Modal onClose={onClose} title="Gestão de Título Executivo">
            <div className="flex flex-col h-[85vh]">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-4">
                    <button onClick={() => setViewMode('DOC')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 ${viewMode === 'DOC' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>
                        <FileText size={14}/> Documento
                    </button>
                    <button onClick={() => setViewMode('SIGNATURES')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 ${viewMode === 'SIGNATURES' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>
                        <FileSignature size={14}/> Assinaturas
                    </button>
                    <button onClick={() => setViewMode('REPORT')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-2 ${viewMode === 'REPORT' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>
                        <Activity size={14}/> Auditoria
                    </button>
                </div>

                <div className="flex-1 bg-white rounded-xl border-4 border-slate-800 overflow-hidden relative shadow-2xl">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50">
                            <Loader2 className="animate-spin text-indigo-600" />
                        </div>
                    ) : viewMode === 'DOC' ? (
                        <iframe srcDoc={htmlContent} className="w-full h-full border-none" title="Legal View" />
                    ) : viewMode === 'SIGNATURES' ? (
                        <div className="bg-slate-900 h-full p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                                <h4 className="text-[10px] font-black text-indigo-400 uppercase mb-4 tracking-widest flex items-center gap-2"><Scale size={14}/> Centro de Assinaturas</h4>
                                
                                <div className="space-y-3">
                                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${getSignatureStatus('CREDOR') ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                                {getSignatureStatus('CREDOR') ? <Check size={16}/> : <User size={16}/>}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-white uppercase">{activeUser.fullName || activeUser.name}</p>
                                                <p className="text-[9px] text-slate-500 font-black uppercase">Credor(a)</p>
                                            </div>
                                        </div>
                                        {!getSignatureStatus('CREDOR') ? (
                                            <button onClick={handleSignAsCreditor} disabled={isSigning} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-indigo-500">Assinar</button>
                                        ) : <span className="text-[9px] font-black text-emerald-500 uppercase">Confirmado</span>}
                                    </div>

                                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${getSignatureStatus('DEVEDOR') ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                                {getSignatureStatus('DEVEDOR') ? <Check size={16}/> : <User size={16}/>}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-white uppercase">{loan.debtorName}</p>
                                                <p className="text-[9px] text-slate-500 font-black uppercase">Devedor(a)</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => sendZapNotification('DEVEDOR', loan.debtorName)} className="p-2 bg-emerald-600/10 text-emerald-500 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><MessageSquare size={16}/></button>
                                            <button onClick={() => copyLink('DEVEDOR')} className={`p-2 rounded-lg transition-all ${copiedKey === 'DEVEDOR' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-blue-400 hover:text-white'}`}>
                                                {copiedKey === 'DEVEDOR' ? <Check size={16}/> : <Copy size={16}/>}
                                            </button>
                                        </div>
                                    </div>

                                    {docRecord?.snapshot.witnesses?.map((w: any, idx: number) => {
                                        const role = `TESTEMUNHA_${idx + 1}`;
                                        const sig = getSignatureStatus(role);
                                        return (
                                            <div key={idx} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${sig ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                                        {sig ? <Check size={16}/> : <Users size={16}/>}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-white uppercase">{w.name}</p>
                                                        <p className="text-[9px] text-slate-500 font-black uppercase">Testemunha {idx + 1}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => copyLink('TESTEMUNHA', idx)} className={`p-2 rounded-lg transition-all ${copiedKey === `TESTEMUNHA${idx}` ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-blue-400 hover:text-white'}`}>
                                                        {copiedKey === `TESTEMUNHA${idx}` ? <Check size={16}/> : <Link size={16}/>}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl flex items-start gap-3">
                                <ShieldCheck size={18} className="text-blue-500 shrink-0 mt-0.5"/>
                                <p className="text-[10px] text-blue-300 leading-relaxed font-medium uppercase tracking-wider">Cada parte deve assinar individualmente através do link exclusivo gerado acima.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-900 h-full p-6 overflow-y-auto custom-scrollbar">
                            <LegalReportView docRecord={docRecord} fullAuditData={fullAuditData} />
                        </div>
                    )}
                </div>

                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-bold uppercase text-xs">Fechar Painel</button>
                    <button onClick={() => { 
                        const win = window.open('', '_blank'); 
                        if (win) {
                            win.document.write(htmlContent); 
                            win.document.close(); 
                            setTimeout(() => win.print(), 500); 
                        }
                    }} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"><Printer size={18}/> Imprimir PDF</button>
                </div>
            </div>
        </Modal>
    );
};
