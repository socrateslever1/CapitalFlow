
import React from 'react';
import { CheckSquare, Square, Download, FileText, Package } from 'lucide-react';
import { downloadFile } from '../../../services/dataService';

interface ExecutionPipelineProps {
    fullAuditData: any;
    onGeneratePDF: () => void;
}

export const ExecutionPipeline: React.FC<ExecutionPipelineProps> = ({ fullAuditData, onGeneratePDF }) => {
    if (!fullAuditData) return null;
    const { doc, signatures } = fullAuditData;

    // Checks
    const checkHash = !!doc.hash_sha256;
    const checkDebtor = signatures.some((s: any) => s.signer_name === doc.snapshot.debtorName);
    const checkWitnesses = signatures.length >= 2;
    const checkEvidence = signatures.every((s: any) => s.ip_origem && s.signed_at);

    const steps = [
        { label: "Documento Gerado e Imutável (Snapshot)", status: true },
        { label: "Integridade Garantida (Hash SHA-256)", status: checkHash },
        { label: "Assinatura do Devedor", status: checkDebtor },
        { label: "Testemunhas Digitais (Mínimo 2)", status: checkWitnesses },
        { label: "Evidências Técnicas (IP/Timestamp)", status: checkEvidence }
    ];

    const allReady = steps.every(s => s.status);

    const handleDownloadPackage = () => {
        // 1. Gera JSON de Auditoria
        const auditPackage = {
            readme: "PACOTE DE EVIDÊNCIAS DIGITAIS - CAPITALFLOW",
            documento: doc,
            assinaturas: signatures,
            hash_verificacao: doc.hash_sha256,
            data_extracao: new Date().toISOString()
        };
        const jsonContent = JSON.stringify(auditPackage, null, 2);
        downloadFile(jsonContent, `EVIDENCIA_LEGAL_${doc.id}.json`, 'application/json');
        
        // 2. Aciona Impressão PDF
        setTimeout(() => onGeneratePDF(), 1000);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right">
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h3 className="text-xs font-black uppercase text-white mb-4 tracking-widest">Checklist de Execução</h3>
                <div className="space-y-3">
                    {steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                            <div className={step.status ? 'text-emerald-500' : 'text-slate-700'}>
                                {step.status ? <CheckSquare size={18}/> : <Square size={18}/>}
                            </div>
                            <span className={`text-xs font-bold ${step.status ? 'text-slate-200' : 'text-slate-500'}`}>{step.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`p-5 rounded-2xl border text-center ${allReady ? 'bg-blue-900/20 border-blue-500/30' : 'bg-slate-900 border-slate-800'}`}>
                <p className="text-xs text-white font-bold mb-4">
                    {allReady ? "Tudo pronto! Gere o pacote para enviar ao advogado." : "Complete os requisitos acima antes de gerar o pacote."}
                </p>
                <button 
                    onClick={handleDownloadPackage}
                    disabled={!allReady}
                    className="w-full py-4 bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-black uppercase text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                >
                    <Package size={16}/> Baixar Pacote Jurídico (JSON + PDF)
                </button>
                <p className="text-[9px] text-slate-500 mt-2">Inclui snapshot JSON auditável e PDF impresso.</p>
            </div>
        </div>
    );
};
