
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Scale, 
  ChevronLeft, 
  FileText, 
  Printer, 
  Scroll, 
  MessageCircle, 
  ShieldCheck, 
  Loader2, 
  Trash2, 
  Eye, 
  PenTool, 
  Plus,
  User,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loan, UserProfile, CapitalSource, LegalDocumentRecord } from '../types';
import { legalService } from '../features/legal/services/legalService';
import { formatMoney } from '../utils/formatters';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface LegalContractPageProps {
  loanId?: string | null;
  loans: Loan[];
  activeUser: UserProfile | null;
  onBack: () => void;
  onRefresh?: () => void;
  isStealthMode: boolean;
}

type DocType = 'CONFISSAO' | 'NOTA_PROMISSORIA' | 'NOTIFICACAO' | 'QUITACAO';

interface DocItem {
  id: DocType;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const DOCUMENT_TYPES: DocItem[] = [
  { 
    id: 'CONFISSAO', 
    title: 'Confissão de Dívida', 
    description: 'Título executivo extrajudicial com força de lei.',
    icon: <Scroll size={20} />,
    color: 'indigo'
  },
  { 
    id: 'NOTA_PROMISSORIA', 
    title: 'Nota Promissória', 
    description: 'Promessa de pagamento para execução direta.',
    icon: <Printer size={20} />,
    color: 'blue'
  },
  { 
    id: 'NOTIFICACAO', 
    title: 'Notificação Extrajudicial', 
    description: 'Aviso formal de cobrança e mora.',
    icon: <MessageCircle size={20} />,
    color: 'amber'
  },
  { 
    id: 'QUITACAO', 
    title: 'Termo de Quitação', 
    description: 'Recibo definitivo de liquidação do débito.',
    icon: <ShieldCheck size={20} />,
    color: 'emerald'
  }
];

export const LegalContractPage: React.FC<LegalContractPageProps> = ({
  loanId: propLoanId,
  loans,
  activeUser,
  onBack,
  onRefresh,
  isStealthMode
}) => {
  const { id: paramsId } = useParams<{ id: string }>();
  const id = propLoanId || paramsId;
  const navigate = useNavigate();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [documents, setDocuments] = useState<Record<string, LegalDocumentRecord | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    const foundLoan = loans.find(l => l.id === id);
    if (!foundLoan) {
      toast.error("Contrato não encontrado");
      onBack();
      return;
    }
    setLoan(foundLoan);

    // Carregar documentos vigentes para cada tipo
    const docs: Record<string, LegalDocumentRecord | null> = {};
    for (const type of DOCUMENT_TYPES) {
      try {
        const { data } = await legalService.getVigentDocument(id, type.id);
        docs[type.id] = data;
      } catch (e) {
        console.error(`Erro ao carregar ${type.id}:`, e);
      }
    }
    setDocuments(docs);
    setIsLoading(false);
  }, [id, loans, onBack]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (type: DocType) => {
    if (!loan || !activeUser || !id) return;
    setIsGenerating(type);
    try {
      const params = legalService.prepareDocumentParams(loan, activeUser, loan.activeAgreement);
      await legalService.generateAndRegisterDocument(
        loan.activeAgreement?.id || id,
        params,
        activeUser.id,
        type
      );
      toast.success(`${type.replace('_', ' ')} gerado com sucesso!`);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(`Erro ao gerar documento: ${e.message}`);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;
    try {
      await legalService.deleteDocument(docId);
      toast.success("Documento excluído");
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e: any) {
      toast.error(`Erro ao excluir: ${e.message}`);
    }
  };

  if (isLoading || !loan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Carregando Jurídico...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* STICKY HEADER */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 py-4 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-lg font-black text-white uppercase tracking-tight leading-none">
            Módulo Jurídico
          </h1>
          <p className="text-[10px] text-slate-500 font-black uppercase mt-1 tracking-widest">
            Contrato #{loan.id.substring(0, 8)}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* INFO CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cliente */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                <User size={20} />
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Cliente</h3>
                <p className="font-bold text-white uppercase">{loan.debtorName || 'Cliente sem nome'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500">Documento</p>
                <p className="text-xs text-slate-300">{loan.debtorDocument || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500">Telefone</p>
                <p className="text-xs text-slate-300">{loan.debtorPhone || 'Não informado'}</p>
              </div>
            </div>
          </div>

          {/* Contrato */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Dívida Atual</h3>
                <p className="font-bold text-white">{formatMoney(loan.totalToReceive, isStealthMode)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500">Status</p>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${loan.status === 'LATE' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'}`}>
                  {loan.status === 'LATE' ? 'Em Atraso' : 'Ativo'}
                </span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500">Início</p>
                <p className="text-xs text-slate-300">{new Date(loan.startDate).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* DOCUMENTS LIST */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-black uppercase text-white tracking-[0.2em] flex items-center gap-2 px-1">
            <Scale size={16} className="text-indigo-500" /> Documentos Jurídicos
          </h2>

          <div className="grid grid-cols-1 gap-3">
            {DOCUMENT_TYPES.map((docType) => {
              const doc = documents[docType.id];
              const isCurrentGenerating = isGenerating === docType.id;

              return (
                <motion.div 
                  key={docType.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-${docType.color}-500/10 flex items-center justify-center text-${docType.color}-500 shrink-0`}>
                      {docType.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">{docType.title}</h4>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{docType.description}</p>
                      
                      {doc && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${doc.status === 'SIGNED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {doc.status === 'SIGNED' ? 'Assinado' : 'Pendente de Assinatura'}
                          </span>
                          <span className="text-[8px] text-slate-600 font-black uppercase">
                            Emitido em {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {!doc ? (
                      <button 
                        onClick={() => handleGenerate(docType.id)}
                        disabled={!!isGenerating}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-indigo-900/20"
                      >
                        {isCurrentGenerating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Gerar Documento
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button 
                          onClick={() => window.open(`/portal/doc/${doc.public_access_token}`, '_blank')}
                          className="flex-1 sm:flex-none p-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 text-[10px] font-black uppercase"
                        >
                          <Eye size={14} /> Visualizar
                        </button>
                        
                        {doc.status !== 'SIGNED' && (
                          <button 
                            onClick={() => window.open(`/portal/doc/${doc.public_access_token}`, '_blank')}
                            className="flex-1 sm:flex-none p-2.5 bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase"
                          >
                            <PenTool size={14} /> Assinar
                          </button>
                        )}

                        <button 
                          onClick={() => handleDelete(doc.id)}
                          className="p-2.5 bg-rose-900/20 text-rose-400 hover:bg-rose-600 hover:text-white rounded-xl transition-all flex items-center justify-center"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* AVISO */}
        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex gap-3">
          <AlertCircle className="text-amber-500 shrink-0" size={20} />
          <p className="text-[10px] text-amber-200/60 font-medium leading-relaxed">
            Os documentos gerados possuem validade jurídica e utilizam assinatura digital com registro de IP, Hash SHA-256 e carimbo de tempo. Certifique-se de que os dados do cliente estão corretos antes de enviar para assinatura.
          </p>
        </div>
      </div>
    </div>
  );
};
