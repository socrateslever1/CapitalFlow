import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Editor } from '@tinymce/tinymce-react';
import tinymce from 'tinymce/tinymce';
import DOMPurify from 'dompurify';

import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/code';
import 'tinymce/plugins/directionality';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/link';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/nonbreaking';
import 'tinymce/plugins/pagebreak';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/quickbars';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/table';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/visualchars';
import 'tinymce/plugins/wordcount';

import { Loan, UserProfile, CapitalSource } from '../types';
import { FileText, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { SystemBackButton } from '../components/ui/SystemBackButton';
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

type LocalDraft = { html: string; savedAt: number };

const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const buildInitialText = (loan: Loan, sources: CapitalSource[], activeUser: UserProfile | null) => {
  const source = sources.find((item) => item.id === loan.sourceId);
  const creditorName = activeUser?.fullName || activeUser?.businessName || activeUser?.name || source?.name || '[PREENCHER]';
  const creditorCpf = activeUser?.document || '[PREENCHER]';
  const creditorAddress = activeUser?.address || '[PREENCHER]';
  const debtorName = loan.debtorName || '[PREENCHER]';
  const debtorCpf = loan.debtorDocument || '[PREENCHER]';
  const debtorAddress = loan.debtorAddress || '[PREENCHER]';
  const legalTerms = buildCapitalOnlyLegalTerms(loan, loan.activeAgreement);
  const capitalToConfess = money(legalTerms.principalAmount);
  const totalLegal = money(legalTerms.legalTotalAmount);
  const installments = legalTerms.installments || [];
  const installmentsCount = installments.length;
  const firstInstallment = installments[0];
  const lastInstallment = installments[installments.length - 1];
  const billingCycle = translateBillingCycle(loan.billingCycle || 'MONTHLY');
  const city = activeUser?.city || '[PREENCHER]';

  const paymentBlock = installmentsCount <= 1
    ? `<p>O pagamento será realizado em <strong>parcela única</strong> no valor de <strong>R$ ${totalLegal}</strong>, com vencimento em <strong>${firstInstallment?.dueDate ? new Date(firstInstallment.dueDate).toLocaleDateString('pt-BR') : '[PREENCHER]'}</strong>.</p>`
    : `<p><strong>Forma de pagamento:</strong> ${installmentsCount} parcelas ${billingCycle.toLowerCase()}s e sucessivas.</p>
       <p><strong>Valor total da obrigação parcelada:</strong> R$ ${totalLegal}. <strong>Valor da parcela:</strong> R$ ${money(Number(firstInstallment?.amount || 0))}. <strong>Primeiro vencimento:</strong> ${firstInstallment?.dueDate ? new Date(firstInstallment.dueDate).toLocaleDateString('pt-BR') : '[PREENCHER]'}. <strong>Último vencimento:</strong> ${lastInstallment?.dueDate ? new Date(lastInstallment.dueDate).toLocaleDateString('pt-BR') : '[PREENCHER]'}.</p>`;

  return `
<h1>INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA E PROMESSA DE PAGAMENTO</h1>
<p><strong>CREDOR(A):</strong> ${creditorName}, CPF nº ${creditorCpf}, residente e domiciliado(a) em ${creditorAddress}.</p>
<p><strong>DEVEDOR(A):</strong> ${debtorName}, CPF nº ${debtorCpf}, residente e domiciliado(a) em ${debtorAddress}.</p>
<p>As partes acima qualificadas firmam o presente instrumento, mediante as cláusulas e condições seguintes.</p>
<h2>CLÁUSULA PRIMEIRA - DO OBJETO E RECONHECIMENTO DA DÍVIDA</h2>
<p>O(A) DEVEDOR(A) reconhece como devido o saldo de capital de <strong>R$ ${capitalToConfess}</strong>, cuja origem e composição constam da memória de cálculo vinculada a este instrumento.</p>
${legalTerms.legalInterestAmount > 0 ? `<p><strong>Juros remuneratórios juridicamente previstos:</strong> R$ ${money(legalTerms.legalInterestAmount)}. <strong>Valor total da obrigação:</strong> R$ ${totalLegal}.</p>` : ''}
<h2>CLÁUSULA SEGUNDA - DA FORMA DE PAGAMENTO</h2>
${paymentBlock}
<h2>CLÁUSULA TERCEIRA - DA MORA E DOS ENCARGOS MORATÓRIOS</h2>
<p>Sobre a prestação vencida e não paga incidirão apenas os encargos juridicamente aplicáveis e expressamente previstos neste instrumento.</p>
<h2>CLÁUSULA QUARTA - DA COBRANÇA E RESPONSABILIDADE PATRIMONIAL</h2>
<p>Em caso de inadimplemento, poderão ser adotadas as medidas extrajudiciais e judiciais legalmente cabíveis, observadas as limitações e garantias previstas em lei.</p>
<h2>CLÁUSULA FINAL - DA TOLERÂNCIA E FORO</h2>
<p>A eventual tolerância quanto a atraso não constituirá novação. Fica eleito o Foro da Comarca de <strong>${city}</strong>, quando juridicamente válido.</p>
<p class="document-date">${city}, ${new Date().toLocaleDateString('pt-BR')}.</p>
<div class="signature-grid">
  <p class="signature-line"><strong>${creditorName}</strong><br>CREDOR(A)<br>CPF: ${creditorCpf}</p>
  <p class="signature-line"><strong>${debtorName}</strong><br>DEVEDOR(A)<br>CPF: ${debtorCpf}</p>
  <p class="signature-line"><strong>[PREENCHER]</strong><br>TESTEMUNHA 1<br>CPF: [PREENCHER]</p>
  <p class="signature-line"><strong>[PREENCHER]</strong><br>TESTEMUNHA 2<br>CPF: [PREENCHER]</p>
</div>`;
};

export const LegalDocumentEditorPage: React.FC<Props> = ({ loanId: propLoanId, loans, sources, activeUser, onBack }) => {
  const { loanId: paramLoanId } = useParams();
  const routeId = propLoanId || paramLoanId || '';
  const loan = useMemo(() => loans.find((item) => String(item.id) === String(routeId)), [loans, routeId]);
  const virtualClientId = routeId.startsWith('virtual-client-') ? routeId.replace('virtual-client-', '') : null;
  const resolvedClientId = safeUUID(loan?.clientId) || safeUUID(virtualClientId);
  const editorRef = useRef<any>(null);

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [existingDocument, setExistingDocument] = useState<ExistingDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);

  const draftKey = useMemo(() => `capitalflow:legal-editor:${existingDocument?.id || routeId || resolvedClientId || 'draft'}`, [existingDocument?.id, resolvedClientId, routeId]);
  const isDirty = content !== savedContent;

  useEffect(() => {
    let cancelled = false;

    const loadCanonicalDocument = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('documentos_juridicos')
          .select('id,loan_id,client_id,tipo,snapshot,snapshot_rendered_html,document_version,status_assinatura')
          .neq('status_assinatura', 'SUPERSEDED');

        if (resolvedClientId && safeUUID(loan?.id)) query = query.or(`client_id.eq.${resolvedClientId},loan_id.eq.${safeUUID(loan?.id)}`);
        else if (resolvedClientId) query = query.eq('client_id', resolvedClientId);
        else if (safeUUID(loan?.id)) query = query.eq('loan_id', safeUUID(loan?.id));
        else return;

        const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;

        const canonical = data?.snapshot_rendered_html || (loan ? buildInitialText(loan, sources, activeUser) : '');
        if (!cancelled) {
          setExistingDocument(data ? data as ExistingDocument : null);
          setContent(canonical);
          setSavedContent(canonical);
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

  useEffect(() => {
    if (isLoading || !content || !draftKey) return;
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as LocalDraft;
      if (parsed?.html && parsed.html !== savedContent) setLocalDraft(parsed);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, isLoading, savedContent]);

  useEffect(() => {
    if (isLoading || !isDirty || !content.trim()) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(draftKey, JSON.stringify({ html: content, savedAt: Date.now() } satisfies LocalDraft));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [content, draftKey, isDirty, isLoading]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const handleBack = () => {
    if (isDirty && !window.confirm('Existem alterações ainda não salvas. Sair mesmo assim?')) return;
    onBack();
  };

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

      const safeHtml = DOMPurify.sanitize(content, { USE_PROFILES: { html: true } });
      const prepared = loan ? legalService.prepareDocumentParams(loan, activeUser, loan.activeAgreement) : (existingDocument?.snapshot || {});
      const snapshot = {
        ...existingDocument?.snapshot,
        ...prepared,
        clientId: resolvedClientId || existingDocument?.client_id,
        loanId: safeUUID(loan?.id) || existingDocument?.loan_id,
        customContent: safeHtml,
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
        p_rendered_html: safeHtml,
        p_profile_id: ownerId,
        p_registration_link_id: null,
      });

      const saved = Array.isArray(data) ? data[0] : data;
      if (error || !saved?.id) throw new Error(error?.message || 'Falha ao salvar a versão jurídica.');

      setContent(safeHtml);
      setSavedContent(safeHtml);
      setExistingDocument({
        id: saved.id,
        loan_id: safeUUID(loan?.id) || existingDocument?.loan_id || null,
        client_id: resolvedClientId || existingDocument?.client_id || null,
        tipo: existingDocument?.tipo || 'CONFISSAO',
        snapshot,
        snapshot_rendered_html: safeHtml,
        document_version: Number(saved.document_version || 1),
        status_assinatura: saved.status_assinatura,
      });
      window.localStorage.removeItem(draftKey);
      setLocalDraft(null);
      toast.success(`Minuta unificada salva como versão ${saved.document_version || 1}.`);
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao salvar: ${error?.message || 'falha desconhecida'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-10">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <SystemBackButton onClick={handleBack} />
          <div className="mt-3 flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><FileText size={20} /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-black uppercase tracking-wide text-white">Editor <span className="text-indigo-400">Jurídico</span></h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-wider">
                <span className="text-slate-500">{existingDocument ? `Documento único • versão ${existingDocument.document_version || 1}` : 'Nova minuta jurídica'}</span>
                <span className={`rounded-full border px-2 py-0.5 ${isDirty ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>{isDirty ? 'Alterações não salvas' : 'Sincronizado'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <button type="button" disabled={!isDirty} onClick={() => setContent(savedContent)} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-[10px] font-black uppercase text-slate-300 disabled:opacity-40 lg:flex-none">
            <RotateCcw size={14}/> Desfazer alterações
          </button>
          <button onClick={() => void handleSave()} disabled={isSaving || isLoading || !content.trim() || !isDirty} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-[10px] font-black uppercase text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 lg:flex-none">
            {isSaving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={15} />}
            {isSaving ? 'Salvando versão...' : 'Salvar versão'}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-[11px] leading-relaxed text-indigo-100">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-300"/>
        <span>Esta é a via jurídica única. Card do cliente, Central Jurídica e Portal leem o mesmo conteúdo. Você pode editar texto, cláusulas, títulos, tabelas e formatação; ao salvar, a versão anterior é preservada e a nova versão passa a ser a vigente.</span>
      </div>

      {localDraft && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-amber-100">Há um rascunho local não salvo de {new Date(localDraft.savedAt).toLocaleString('pt-BR')}.</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setContent(localDraft.html); setLocalDraft(null); }} className="rounded-md bg-amber-500 px-3 py-1.5 text-[9px] font-black uppercase text-slate-950">Restaurar</button>
            <button type="button" onClick={() => { window.localStorage.removeItem(draftKey); setLocalDraft(null); }} className="rounded-md border border-amber-500/30 px-3 py-1.5 text-[9px] font-black uppercase text-amber-200">Descartar</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {isLoading ? (
          <div className="flex h-[720px] items-center justify-center text-slate-500">Carregando a minuta oficial...</div>
        ) : (
          <Editor
            onInit={(_evt, editor) => { editorRef.current = editor; }}
            value={content}
            onEditorChange={setContent}
            init={{
              height: 760,
              menubar: 'file edit view insert format tools table',
              plugins: [
                'advlist anchor autolink charmap code directionality fullscreen insertdatetime link lists nonbreaking pagebreak preview quickbars searchreplace table visualblocks visualchars wordcount',
              ],
              toolbar: [
                'undo redo | blocks styles | fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor',
                'alignleft aligncenter alignright alignjustify | lineheight | bullist numlist outdent indent | blockquote nonbreaking pagebreak',
                'table link anchor charmap insertdatetime | searchreplace visualblocks visualchars | removeformat | preview code fullscreen',
              ].join(' | '),
              toolbar_mode: 'sliding',
              toolbar_sticky: true,
              quickbars_selection_toolbar: 'bold italic underline | forecolor backcolor | alignleft aligncenter alignright alignjustify | removeformat',
              contextmenu: 'link table',
              font_family_formats: 'Times New Roman=times new roman,times,serif; Arial=arial,helvetica,sans-serif; Calibri=calibri,sans-serif; Georgia=georgia,serif; Courier New=courier new,courier,monospace',
              font_size_formats: '8pt 9pt 10pt 11pt 12pt 13pt 14pt 16pt 18pt 20pt 24pt 28pt',
              line_height_formats: '1 1.15 1.3 1.5 1.75 2',
              style_formats: [
                { title: 'Título principal', block: 'h1', styles: { 'text-align': 'center', 'font-size': '14pt', 'font-weight': '700', 'text-transform': 'uppercase' } },
                { title: 'Cláusula', block: 'h2', styles: { 'font-size': '11pt', 'font-weight': '700', 'text-transform': 'uppercase', 'margin-top': '18pt' } },
                { title: 'Parágrafo jurídico', block: 'p', styles: { 'text-align': 'justify', 'text-indent': '1.25cm' } },
                { title: 'Sem recuo', block: 'p', styles: { 'text-align': 'justify', 'text-indent': '0' } },
                { title: 'Centralizado', block: 'p', styles: { 'text-align': 'center', 'text-indent': '0' } },
                { title: 'Assinatura', block: 'p', classes: 'signature-line' },
              ],
              table_default_attributes: { border: '1' },
              table_default_styles: { width: '100%', 'border-collapse': 'collapse' },
              table_sizing_mode: 'responsive',
              pagebreak_separator: '<div class="page-break"></div>',
              browser_spellcheck: true,
              object_resizing: true,
              resize: true,
              statusbar: true,
              branding: false,
              promotion: false,
              skin: 'oxide',
              content_css: false,
              licenseKey: 'gpl',
              content_style: `
                html { background: #d8dde5; }
                body {
                  box-sizing: border-box;
                  width: 210mm;
                  min-height: 297mm;
                  margin: 18px auto 60px;
                  padding: 25mm 25mm 25mm 30mm;
                  background: #fff;
                  color: #000;
                  box-shadow: 0 6px 26px rgba(15,23,42,.22);
                  font-family: 'Times New Roman', Times, serif;
                  font-size: 11pt;
                  line-height: 1.5;
                  text-align: justify;
                }
                p { margin: 0 0 8pt; }
                h1 { text-align: center; font-size: 14pt; line-height: 1.25; margin: 0 0 18pt; text-transform: uppercase; }
                h2 { font-size: 11pt; line-height: 1.35; margin: 18pt 0 8pt; text-transform: uppercase; }
                table { margin: 12pt 0; font-size: 10pt; }
                td, th { border: 1px solid #000; padding: 5pt; }
                .document-date { margin-top: 30pt; text-align: center; text-indent: 0; }
                .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 42pt 36pt; margin-top: 54pt; }
                .signature-line { border-top: 1px solid #000; padding-top: 5pt; text-align: center; text-indent: 0; page-break-inside: avoid; }
                .page-break { page-break-after: always; height: 1px; border-top: 1px dashed #94a3b8; margin: 18pt -10mm; }
                @media (max-width: 900px) {
                  body { width: calc(100% - 20px); min-height: auto; margin: 10px; padding: 18px; }
                  .signature-grid { grid-template-columns: 1fr; }
                }
                @media print {
                  html { background: #fff; }
                  body { box-shadow: none; margin: 0; width: auto; min-height: auto; }
                  .page-break { border: 0; }
                }
              `,
            }}
          />
        )}
      </div>
    </div>
  );
};
