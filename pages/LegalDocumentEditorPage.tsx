import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Editor } from '@tinymce/tinymce-react';
import tinymce from 'tinymce/tinymce';

import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';

import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/table';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/wordcount';

import { Loan, UserProfile, CapitalSource } from '../types';
import { ArrowLeft, Save, RefreshCw, FileText } from 'lucide-react';
import { legalService } from '../features/legal/services/legalService';
import { safeUUID } from '../utils/uuid';
import { toast } from 'sonner';

// Essencial para o funcionamento do @tinymce/tinymce-react em modo bundled
if (typeof window !== 'undefined') {
  (window as any).tinymce = tinymce;
}

interface Props {
  loanId?: string;
  loans: Loan[];
  sources: CapitalSource[];
  activeUser: UserProfile | null;
  onBack: () => void;
}

export const LegalDocumentEditorPage: React.FC<Props> = ({ loanId: propLoanId, loans, sources, activeUser, onBack }) => {
  const { loanId: paramLoanId } = useParams();
  const loanId = propLoanId || paramLoanId;
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!loanId || !loans.length) return;

    const loan = loans.find(l => String(l.id) === String(loanId));
    if (!loan) return;

    const source = sources.find(s => s.id === loan.sourceId);
    const creditorName = source?.name || activeUser?.businessName || activeUser?.name || '[PREENCHER]';
    const creditorCpf = activeUser?.document || '[PREENCHER]';

    // Mapeamento de campos para o template solicitado
    const debtorName = loan.debtorName || '[PREENCHER]';
    const debtorCpf = loan.debtorDocument || '[PREENCHER]';
    const totalToReceive = loan.totalToReceive?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '[PREENCHER]';
    
    // Encontrar próxima data de vencimento
    const nextInstallment = loan.installments?.find(i => i.status === 'PENDING' || i.status === 'LATE');
    const nextDueDate = nextInstallment?.dueDate ? new Date(nextInstallment.dueDate).toLocaleDateString() : '[PREENCHER]';
    
    const city = activeUser?.city || '[PREENCHER]';

    const installmentsCount = loan.installments?.length || 0;
    const isSinglePayment = installmentsCount === 1;
    const billingCycle = loan.billingCycle || 'MENSAL';
    
    const formaPagamentoText = isSinglePayment 
      ? 'EM PARCELA ÚNICA' 
      : `DE FORMA PARCELADA (${billingCycle})`;

    const baseText = `
INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA E PROMESSA DE PAGAMENTO

PARTES

CREDOR: ${creditorName}, [NACIONALIDADE], [ESTADO CIVIL], [PROFISSÃO], CPF: ${creditorCpf}, residente em [ENDEREÇO COMPLETO].

DEVEDOR: ${debtorName}, [NACIONALIDADE], [ESTADO CIVIL], [PROFISSÃO], CPF: ${debtorCpf}, residente em [ENDEREÇO COMPLETO].

CLÁUSULA 1 - DO RECONHECIMENTO DA DÍVIDA

O DEVEDOR reconhece dívida líquida, certa e exigível no valor de:

R$ ${totalToReceive}

PARÁGRAFO ÚNICO: Este instrumento constitui Título Executivo Extrajudicial (Art. 784, III, CPC).

CLÁUSULA 2 - DA FORMA DE PAGAMENTO

O pagamento será realizado ${formaPagamentoText}.

Vencimento: ${nextDueDate}

CLÁUSULA 3 - DOS ENCARGOS

- Multa: 10%
- Juros: 1% ao mês
- Honorários: 20%

CLÁUSULA 4 - RESPONSABILIDADE PATRIMONIAL

O DEVEDOR responde com todos os bens (Art. 789 CPC).

CLÁUSULA 5 - MEDIDAS COERCITIVAS

Autorizado:
- SISBAJUD
- RENAJUD
- SPC/SERASA

CLÁUSULA 6 - PENHORA

Autorizada constrição judicial em caso de inadimplência.

CLÁUSULA 7 - FORO

Foro: ${city}

DATA: ${new Date().toLocaleDateString()}

ASSINATURAS

CREDOR: ${creditorName}
DEVEDOR: ${debtorName}

TESTEMUNHAS:

1. [PREENCHER] - CPF: [PREENCHER]
2. [PREENCHER] - CPF: [PREENCHER]

--------------------------------------------------

NOTA PROMISSÓRIA

Valor: R$ ${totalToReceive}

Prometo pagar a ${creditorName} a quantia acima.

Emitente: ${debtorName}

CPF: ${debtorCpf}

Local: ${city}
Data: ${new Date().toLocaleDateString()}

Assinatura: ______________________
`;

    setContent(baseText);

  }, [loanId, loans, sources, activeUser]);

  const handleSave = async () => {
    if (!loanId || !activeUser || !content) return;

    const loan = loans.find(l => String(l.id) === String(loanId));
    if (!loan) return;

    const source = sources.find(s => s.id === loan.sourceId);
    const creditorName = source?.name || activeUser?.businessName || activeUser?.name || '[PREENCHER]';

    setIsSaving(true);
    try {
      const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
      if (!ownerId) throw new Error("Erro de autenticação.");

      await legalService.generateAndRegisterDocument(
        loan.id,
        { 
          customContent: content,
          creditorName: creditorName,
          debtorName: loan.debtorName,
          totalDebt: loan.totalToReceive
        } as any,
        ownerId,
        'CONFISSAO'
      );

      toast.success("Documento salvo com sucesso!");
      onBack();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-all border border-slate-700 shadow-lg"
          >
            <ArrowLeft size={18} className="text-slate-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">
                Editor <span className="text-indigo-500">Jurídico</span>
              </h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">
                Personalização de Instrumento
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded-xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? 'Salvando...' : 'Salvar Documento'}
        </button>
      </div>

      {/* EDITOR CONTAINER */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        <Editor
          value={content}
          onEditorChange={(newValue) => setContent(newValue)}
          init={{
            height: 600,
            menubar: true,
            plugins: [
              'advlist autolink lists link table',
              'code fullscreen wordcount'
            ],
            toolbar:
              'undo redo | formatselect | bold italic | ' +
              'alignleft aligncenter alignright alignjustify | ' +
              'bullist numlist | table | code fullscreen',
            content_style:
              'body { font-family:Arial,sans-serif; font-size:14px }',
            branding: false,
            promotion: false,
            skin: 'oxide',
            content_css: 'default',
            licenseKey: 'gpl'
          }}
        />
      </div>

      <div className="mt-6 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
          Este documento será salvo como a versão oficial do contrato. Certifique-se de que todos os dados do Credor e Devedor estão corretos antes de finalizar.
        </p>
      </div>
    </div>
  );
};
