
import React from 'react';
import { FileText, ShieldCheck, Activity, Globe, Cpu, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LegalDocumentRecord } from '../../../types';

interface LegalReportViewProps {
    docRecord: LegalDocumentRecord | null;
    fullAuditData: any;
}

export const LegalReportView: React.FC<LegalReportViewProps> = ({ docRecord, fullAuditData }) => {
    if (!docRecord || !fullAuditData) return <div className="text-center p-10 text-slate-500">Carregando dados de auditoria...</div>;

    const { doc, signatures = [], logs = [] } = fullAuditData;
    
    // Verificações de Execução
    const hasDebtorSign = signatures.some((s: any) => s.signer_name === doc.snapshot?.debtorName);
    const hasWitnesses = signatures.length >= 3; 
    const integrityCheck = doc.hash_sha256 ? true : false;
    
    const isReadyForExecution = hasDebtorSign && integrityCheck;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            
            {/* CABEÇALHO DO RELATÓRIO */}
            <div className={`p-5 rounded-2xl border flex items-center justify-between ${isReadyForExecution ? 'bg-emerald-950/30 border-emerald-500/50' : 'bg-amber-950/30 border-amber-500/50'}`}>
                <div>
                    <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${isReadyForExecution ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isReadyForExecution ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}
                        Status de Exequibilidade
                    </h3>
                    <p className="text-xs text-white mt-1">
                        {isReadyForExecution 
                            ? "Documento apto para Execução de Título Extrajudicial (CPC Art. 784, III)." 
                            : "Atenção: Pendências detectadas para execução direta."}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">ID do Documento</p>
                    <p className="text-xs font-mono text-white">{doc.id}</p>
                </div>
            </div>

            {/* DADOS TÉCNICOS */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
                <h4 className="text-xs font-black uppercase text-blue-500 mb-4 flex items-center gap-2"><Cpu size={14}/> Metadados Forenses</h4>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Hash SHA-256 (Integridade)</p>
                        <p className="text-[10px] font-mono text-white bg-slate-900 p-2 rounded border border-slate-800 break-all">{doc.hash_sha256}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Criação do Registro</p>
                        <p className="text-xs text-white">{new Date(doc.created_at).toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* ASSINATURAS */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
                <h4 className="text-xs font-black uppercase text-emerald-500 mb-4 flex items-center gap-2"><ShieldCheck size={14}/> Assinaturas Registradas</h4>
                <div className="space-y-3">
                    {signatures.length === 0 ? <p className="text-xs text-slate-500 italic">Nenhuma assinatura registrada.</p> : signatures.map((s: any) => (
                        <div key={s.id} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800">
                            <div>
                                <p className="text-xs font-bold text-white">{s.signer_name}</p>
                                <p className="text-[10px] text-slate-500">{s.signer_email} • {s.signer_document}</p>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center gap-2 justify-end text-[10px] text-slate-400">
                                    <Globe size={10}/> IP: {s.ip_origem || 'N/A'}
                                </div>
                                <p className="text-[9px] text-emerald-600 font-mono mt-1">{new Date(s.signed_at).toLocaleString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* LOGS DE AUDITORIA */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
                <h4 className="text-xs font-black uppercase text-purple-500 mb-4 flex items-center gap-2"><Activity size={14}/> Trilha de Auditoria (Logs)</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {logs.length === 0 ? <p className="text-[10px] text-slate-500 italic">Nenhum log registrado.</p> : logs.map((log: any) => (
                        <div key={log.id} className="text-[10px] border-l-2 border-slate-800 pl-3 py-1">
                            <span className="text-slate-500 font-mono mr-2">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className="text-white font-bold">{log.action}</span>
                            <span className="text-slate-500 block text-[9px] mt-0.5">{log.details} | IP: {log.ip_origem}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl text-[10px] text-blue-300 leading-relaxed">
                Este relatório técnico é gerado automaticamente pelo sistema CapitalFlow e serve como evidência auxiliar para comprovação da autoria e integridade do documento em processos judiciais, conforme Medida Provisória 2.200-2/2001 e Lei 14.063/2020.
            </div>
        </div>
    );
};
