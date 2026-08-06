import React, { useEffect, useMemo, useState } from 'react';
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
import { ArrowLeft, Save, FileText } from 'lucide-react';
import { legalService } from '../features/legal/services/legalService';
import { buildCapitalOnlyLegalTerms } from '../features/legal/domain/capitalOnlyLegalTerms';
import { safeUUID } from '../utils/uuid';
import { toast } from 'sonner';
import { translateBillingCycle } from '../utils/translationHelpers';
import { supabase } from '../lib/supabase';

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

type ExistingDocument = {
  id: string;
  loan_id?: string | null;
  client_id?: string | null;
  tipo?: string | null;
  snapshot?: any;
  snapshot_rendered_html?: string | null;
  document_version?: number | null;
  status_assinatura?: string | null;
};

const buildInitialText = (loan: Loan, sources: CapitalSource[], activeUser: UserProfile | null) => {
  const source = sources.find((item) => item.id === loan.sourceId);
  const creditorName = source?.name || activeUser?.businessName || activeUser?.name || '[PREENCHER]';
  const creditorCpf = activeUser?.document || '[PREENCHER]';
  const debtorName = loan.debtorName || '[PREENCHER]';
  const debtorCpf = loan.debtorDocument || '[PREENCHER]';
  const legalTerms = buildCapitalOnlyLegalTerms(loan, loan.activeAgreement);
  const capitalToConfess = legalTerms.principalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const nextInstallment = loan.installments?.find((item) => item.status === 'PENDING' || item.status === 'LATE');
  const nextDueDate = nextInstallment?.dueDate ? new Date(nextInstallment.dueDate).toLocaleDateString('pt-BR') : '[PREENCHER]';
  const city = activeUser?.city || '[PREENCHER]';
  const installmentsCount = loan.installments?.length || 0;
  const billingCycle = translateBillingCycle(loan.billingCycle || 'MONTHLY');
  const paymentText = installmentsCount === 1 ? 'EM PARCELA ÚNICA' : `DE FORMA PARCELADA (${billingCycle})`;

  return `
<h1>INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA E PROMESSA DE PAGAMENTO</h1>
<h2>PARTES</h2>
<p><strong>CREDOR:</strong> ${creditorName}, CPF: ${creditorCpf}, residente em [ENDEREÇO COMPLETO].</p>
<p><strong>DEVEDOR:</strong> ${debtorName}, CPF: ${debtorCpf}, residente em [ENDEREÇO COMPLETO].</p>
<h2>CLÁUSULA 1 - DO RECONHECIMENTO DA DÍVIDA</h2>
<p>O DEVEDOR reconhece dívida líquida, certa e exigível no valor de <strong>R$ ${capitalToConfess}</strong>.</p>
<p>O valor corresponde ao saldo de capital juridicamente apurado, conforme a memória de cálculo vinculada ao documento.</p>
<p><strong>PARÁGRAFO ÚNICO:</strong> Este instrumento constitui título executivo extrajudicial quando preenchidos os requisitos legais aplicáveis.</p>
<h2>CLÁUSULA 2 - DA FORMA DE PAGAMENTO</h2>
<p>O pagamento será realizado ${paymentText}. Vencimento: ${nextDueDate}.</p>
<h2>CLÁUSULA 3 - DOS ENCARGOS</h2>
<ul><li>Multa moratória: 2% sobre a prestação vencida e não paga.</li><li>Juros de mora: taxa legal aplicável, calculada proporcionalmente.</li><li>Atualização monetária pelo índice juridicamente aplicável.</li><li>Custas e honorários somente quando efetivamente devidos.</li></ul>
<h2>CLÁUSULA 4 - RESPONSABILIDADE PATRIMONIAL</h2>
<p>A responsabilidade patrimonial observará os limites, garantias e impenhorabilidades previstos em lei.</p>
<h2>CLÁUSULA 5 - FORO</h2>
<p>Foro: ${city}.</p>
<p>Data: ${new Date().toLocaleDateString('pt-BR')}.</p>
<h2>ASSINATURAS</h2>
<p>CREDOR: ${creditorName}</p><p>DEVEDOR: ${debtorName}</p>
<p>TESTEMUNHA 1: [PREENCHER] - CPF: [PREENCHER]</p>
<p>TESTEMUNHA 2: [PREENCHER] - CPF: [PREENCHER]</p>`;
};

export const LegalDocumentEditorPage: React.FC<Props> = ({ loanId: propLoanId, loans, sources, activeUser, onBack }) => {
  const { loanId: paramLoanId } = useParams();
  const routeId = propLoanId || paramLoanId || '';
  const loan = useMemo(() => loans.find((item) => String(item.id) === String(routeId)), [loans, routeId]);
  const virtualClientId = routeId.startsWith('virtual-client-') ? routeId.replace('virtual-client-', '') : null;
  const resolvedClientId = safeUUID(loan?.clientId) || safeUUID(virtualClientId);

  const [content, setContent] = useState('');
  const [existingDocument, setExistingDocument] = useState<ExistingDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCanonicalDocument = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('documentos_juridicos')
          .select('id,loan_id,client_id,tipo,snapshot,snapshot_rendered_html,document_version,status_assinatura')
          .neq('status_assinatura', 'SUPERSEDED');

        if (resolvedClientId && safeUUID(loan?.id)) {
          query = query.or(`client_id.eq.${resolvedClientId},loan_id.eq.${safeUUID(loan?.id)}`);
        } else if (resolvedClientId) {
          query = query.eq('client_id', resolvedClientId);
        } else if (safeUUID(loan?.id)) {
          query = query.eq('loan_id', safeUUID(loan?.id));
        } else {
          if (!cancelled) {
            setContent('');
            setExistingDocument(null);
          }
          return;
        }

        const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;

        if (!cancelled && data?.snapshot_rendered_html) {
          setExistingDocument(data as ExistingDocument);
          setContent(data.snapshot_rendered_html);
          return;
        }

        if (!cancelled && loan) {
          setExistingDocument(null);
          setContent(buildInitialText(loan, sources, activeUser));
        }
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Não foi possível carregar a minuta jurídica.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadCanonicalDocument();
    return () => { cancelled = true; };
  }, [activeUser, loan, resolvedClientId, sources]);

  const handleSave = async () => {
    if (!activeUser || !content.trim()) return;
    if (!loan && !existingDocument) {
      toast.error('Não existe minuta vinculada a este cliente para edição.');
      return;
    }

    setIsSaving(true);
    try {
      const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
      if (!ownerId) throw new Error('Erro de autenticação.');

      const prepared = loan
        ? legalService.prepareDocumentParams(loan, activeUser, loan.activeAgreement)
        : (existingDocument?.snapshot || {});

      const snapshot = {
        ...existingDocument?.snapshot,
        ...prepared,
        clientId: resolvedClientId || existingDocument?.client_id,
        loanId: safeUUID(loan?.id) || existingDocument?.loan_id,
        customContent: content,
        timestamp: new Date().toISOString(),
        previousDocumentId: existingDocument?.id || null,
        previousVersion: existingDocument?.document_version || null,
      };

      const { data, error } = await supabase.rpc('create_documento_juridico_versionado', {
        p_base_document_id: existingDocument?.id || null,
        p_client_id: resolvedClientId || existingDocument?.client_id || null,
        p_loan_id: safeUUID(loan?.id) || existingDocument?.loan_id || null,
        p_tipo: existingDocument?.tipo || 'CONFISSAO',
        p_snapshot: snapshot,
        p_rendered_html: content,
        p_profile_id: ownerId,
        p_registration_link_id: null,
      });

      const saved = Array.isArray(data) ? data[0] : data;
      if (error || !saved?.id) throw new Error(error?.message || 'Falha ao salvar a versão jurídica.');

      setExistingDocument({
        id: saved.id,
        loan_id: safeUUID(loan?.id) || existingDocument?.loan_id || null,
        client_id: resolvedClientId || existingDocument?.client_id || null,
        tipo: existingDocument?.tipo || 'CONFISSAO',
        snapshot,
        snapshot_rendered_html: content,
        document_version: Number(saved.document_version || 1),
        status_assinatura: saved.status_assinatura,
      });

      toast.success(`Minuta unificada salva como versão ${saved.document_version || 1}.`);
      onBack();
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao salvar: ${error?.message || 'falha desconhecida'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-all border border-slate-700 shadow-lg">
            <ArrowLeft size={18} className="text-slate-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-900/20"><FileText size={20} /></div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Editor <span className="text-indigo-500">Jurídico</span></h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">
                {existingDocument ? `Documento único • versão ${existingDocument.document_version || 1}` : 'Nova minuta jurídica'}
              </p>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={isSaving || isLoading || !content.trim()} className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20">
          {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Salvando versão...' : 'Salvar mesma minuta'}
        </button>
      </div>

      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
        Card do cliente, Central Jurídica e Portal usam este mesmo documento. Ao salvar, a versão anterior é preservada e o cliente passa a ver somente a versão atual.
      </div>

      <div className="bg-white rounded-lg overflow-hidden shadow-2xl border border-white/10">
        {isLoading ? (
          <div className="flex h-[600px] items-center justify-center text-slate-500">Carregando a minuta oficial...</div>
        ) : (
          <Editor
            value={content}
            onEditorChange={setContent}
            init={{
              height: 600,
              menubar: true,
              plugins: ['advlist autolink lists link table', 'code fullscreen wordcount'],
              toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist | table | code fullscreen',
              content_style: 'body { font-family:Arial,sans-serif; font-size:14px }',
              branding: false,
              promotion: false,
              skin: 'oxide',
              content_css: 'default',
              licenseKey: 'gpl',
            }}
          />
        )}
      </div>
    </div>
  );
};
