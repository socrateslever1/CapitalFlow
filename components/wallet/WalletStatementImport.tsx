import React, { useState } from 'react';
import {
  FileText,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  X,
  Sparkles,
  Zap,
  Image as ImageIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Receipt,
  CreditCard,
  Building2,
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { tryParseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';
import { CardInvoiceSummaryPreview } from './CardInvoiceSummaryPreview';
import { issuerMatchesBank, type CardInvoiceSummary } from '../../utils/cardInvoiceSummary';
import { detectPreviouslyImported } from '../../utils/walletStatementDuplicates';
import type { WalletStatementRow } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import type { WalletIssuerInvoiceCommit } from '../../services/personalWallet.service';
import { parseStatementPdf, ParsedStatementRow } from '../../utils/walletStatementPdf';
import {
  parseSmartFinancialDocument,
  SmartStatementParseResult,
} from '../../utils/statementSmartReader';

type Props = {
  kind: 'ACCOUNT' | 'CARD';
  targetId: string;
  targetName: string;
  targetIssuer?: string | null;
  targetLastFour?: string | null;
  existingRows?: WalletStatementRow[];
  initialDueMonth?: string | null;
  hasOpening?: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
  onSummarySaved?: (dueMonth: string) => Promise<void>;
};

const extraCategories = ['Compras'];
const categories = [
  'Outros',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Contas da casa',
  'Salário',
  'Transferências',
  'Lazer',
  'Educação',
  'Serviços',
];

export const WalletStatementImport: React.FC<Props> = ({
  kind,
  targetId,
  targetName,
  targetIssuer,
  targetLastFour,
  existingRows = [],
  initialDueMonth,
  hasOpening = false,
  onClose,
  onImported,
  onSummarySaved,
}) => {
  const [mode, setMode] = useState<'NEW' | 'INCLUDED' | 'DOCUMENT'>(
    hasOpening ? 'INCLUDED' : 'NEW'
  );
  const [dueMonth, setDueMonth] = useState(
    (initialDueMonth || new Date().toLocaleDateString('en-CA')).slice(0, 7)
  );
  const [source, setSource] = useState<File | null>(null);
  const [result, setResult] = useState<SmartStatementParseResult | null>(null);
  const [rows, setRows] = useState<ParsedStatementRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<number | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfPasswordRequired, setPdfPasswordRequired] = useState(false);

  const declaredBank = result?.invoiceSummary?.institution;
  const bankMismatch = kind === 'CARD' && !issuerMatchesBank(targetIssuer, declaredBank || null);
  const duplicateKeys = detectPreviouslyImported(rows, existingRows, kind, targetId);
  const selectedDuplicates = rows.filter(row => row.selected && duplicateKeys.has(row.rowKey));
  const cardMismatch = Boolean(kind === 'CARD' && targetLastFour
    && result?.invoiceSummary?.cardLastFour
    && result.invoiceSummary.cardLastFour !== targetLastFour);
  const destinationMismatch = bankMismatch || cardMismatch;
  const saveSummary = async (summary: CardInvoiceSummary): Promise<WalletIssuerInvoiceCommit> => {
    if (!result || kind !== 'CARD') throw new Error('Fatura não carregada.');
    if (!issuerMatchesBank(targetIssuer, summary.institution) ||
      (targetLastFour && summary.cardLastFour && targetLastFour !== summary.cardLastFour))
      throw new Error('A fatura não corresponde à instituição ou ao cartão selecionado.');
    const referenceMonth = (summary.dueDate || dueMonth + '-01').slice(0,7);
    const confirmation = await personalWalletService.saveCardInvoiceFacts({
      cardId:targetId, dueMonth:referenceMonth+'-01', dueDate:summary.dueDate,
      issuer:summary.institution, invoiceTotal:summary.invoiceTotal,
      minimumPayment:summary.minimumPayment, creditLimit:summary.creditLimit,
      usedLimit:summary.usedLimit, availableLimit:summary.availableLimit,
      futureInstallments:summary.futureInstallments, sourceHash:result.hash,
      sourceType:result.sourceType === 'OFX' ? 'OFX' :
        result.sourceType === 'PDF_NATIVE' || result.sourceType === 'PDF_AI' ? 'PDF' : 'MANUAL',
    });
    setDueMonth(referenceMonth);
    await onSummarySaved?.(referenceMonth+'-01');
    return confirmation;
  };

  // Raw text survives partial edits and pasted bank separators; invalid drafts
  // never become zero or mutate the persisted statement value.
  const [rowAmountDrafts, setRowAmountDrafts] = useState<Record<string, string>>({});
  const selectedCount = rows.filter((row) => row.selected).length;
  const selectedSum = rows
    .filter((row) => row.selected)
    .reduce((sum, row) => sum + row.amount, 0);

  const selectedInvalid = rows.some(
    (row) =>
      row.selected &&
      ((Object.prototype.hasOwnProperty.call(rowAmountDrafts, row.rowKey) &&
        tryParseWalletSignedMoney(rowAmountDrafts[row.rowKey]) === null) ||
       !Number.isFinite(row.amount) ||
        row.amount === 0 ||
        Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.0001 ||
        !row.date ||
        !row.description.trim())
  );

  const parse = async (forceAi = false, password?: string) => {
    if (!source) return;
    setBusy(true);
    setError('');
    setPdfPasswordRequired(false);
    setFinished(null);
    try {
      // Processa com o leitor inteligente universal (OFX / PDF / Imagem com IA)
      const parsed = await parseSmartFinancialDocument(source, kind, { forceAi, pdfPassword: password });
      setPdfPassword('');
      if (kind === 'CARD' && parsed.invoiceSummary?.dueDate) setDueMonth(parsed.invoiceSummary.dueDate.slice(0,7));
      setResult(parsed);
      setRowAmountDrafts({});
      setRows(parsed.rows.map(row => detectPreviouslyImported([row], existingRows, kind, targetId).has(row.rowKey)
        ? { ...row, selected: false } : row));
      setAllowDuplicates(false);

      if (!parsed.rows.length) {
        setError(
          source.name.toLowerCase().endsWith('.pdf')
            ? 'O leitor local não encontrou transações. O PDF pode ser digitalizado ou ter um layout bancário diferente; tente a IA somente se desejar.'
            : 'Nenhuma transação válida encontrada. Confira se o arquivo exportado contém lançamentos.'
        );
      } else if (parsed.previewUrl) {
        setShowPreview(true);
      }
    } catch (reason: any) {
      setResult(null);
      setRows([]);
      if (reason?.code === 'PDF_PASSWORD_REQUIRED' || reason?.code === 'PDF_PASSWORD_INCORRECT') setPdfPasswordRequired(true);
      setError(reason?.message || 'Não foi possível ler o documento.');
    } finally {
      setBusy(false);
    }
  };

  const revise = (index: number, change: Partial<ParsedStatementRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...change } : row))
    );

  const save = async () => {
    if (destinationMismatch) { setError('Esta fatura pertence a outra instituição ou final de cartão. Selecione o cartão correto.'); return; }
    if (selectedDuplicates.length && !allowDuplicates) {
      setError('Há lançamentos já importados de outro arquivo. Desmarque-os ou autorize explicitamente a repetição após conferir no banco.');
      return;
    }
    if (!result || !selectedCount || selectedInvalid) {
      setError('Revise os valores, as datas e as descrições selecionadas.');
      return;
    }
    setBusy(true);
    setError('');
    let recorded = 0;
    try {
      for (const row of rows.filter((x) => x.selected)) {
        const rowId = await personalWalletService.recordStatementRow({
          targetKind: kind,
          targetId,
          documentHash: result.hash,
          rowKey: row.rowKey,
          date: row.date,
          description: row.description,
          amount: row.amount,
          category: row.category,
          installmentNumber: row.installmentNumber,
          installmentTotal: row.installmentTotal,
        });

        if (kind === 'CARD' && mode !== 'DOCUMENT') {
          if (row.amount <= 0) {
            throw new Error(
              'Desmarque pagamentos e créditos. Registre somente compras positivas como gastos na fatura.'
            );
          }
          await personalWalletService.importCardStatementPurchase(
            rowId,
            dueMonth + '-01',
            mode === 'INCLUDED'
          );
        }
        recorded++;
      }
      await onImported();
      setFinished(recorded);
      setRows((current) => current.map((row) => ({ ...row, selected: false })));
    } catch (reason: any) {
      await onImported().catch(() => {});
      setError(
        `${recorded} lançamento(s) processados. ${
          reason?.message || 'Falha no registro.'
        } Repita a seleção para retomar sem duplicar.`
      );
    } finally {
      setBusy(false);
    }
  };

  const isPdf = source?.type === 'application/pdf' || /\.pdf$/i.test(source?.name || '');
  const isImage = source?.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(source?.name || '');
  const isOfx = source?.name?.toLowerCase().endsWith('.ofx') || source?.name?.toLowerCase().endsWith('.qfx');

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/90 p-2 sm:p-5 backdrop-blur-sm"
    >
      <section className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3.5 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">
                  Leitor Inteligente de Faturas e Extratos
                </h2>
                <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-800">
                  OFX / PDF / Imagem
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Destino: <strong className="text-slate-200">{targetName}</strong> ({kind === 'CARD' ? 'Fatura do Cartão' : 'Conta Bancária'})
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={19} />
          </button>
        </header>

        {/* Content */}
        <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Banner de Custo & Inteligência */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200">
              <Zap size={18} className="shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong className="block font-semibold text-emerald-300">
                  Custo R$ 0,00 (100% Local)
                </strong>
                Arquivos <strong>.OFX</strong> e <strong>PDF com texto</strong> são lidos diretamente no seu navegador, sem custo e com total sigilo.
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-indigo-200">
              <Sparkles size={18} className="shrink-0 text-indigo-400 mt-0.5" />
              <div>
                <strong className="block font-semibold text-indigo-300">
                  IA Vision Multimodal (Frações de centavo)
                </strong>
                Prints de tela, faturas digitalizadas ou fotos de comprovantes Pix são dissecados automaticamente com IA.
              </div>
            </div>
          </div>

          {/* Configuração de Destino do Cartão */}
          {kind === 'CARD' && (
            <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300 font-medium">
                Como registrar na Carteira
                <select
                  disabled={busy}
                  value={mode}
                  onChange={(event) => setMode(event.target.value as typeof mode)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="NEW">Novos gastos — somar ao limite usado da fatura</option>
                  <option value="INCLUDED">Já incluídos na situação inicial da fatura</option>
                  <option value="DOCUMENT">Somente conferência — não alterar limites/saldos</option>
                </select>
              </label>

              <label className="text-xs text-slate-300 font-medium">
                Mês de vencimento da fatura
                <input
                  required
                  type="month"
                  value={dueMonth}
                  disabled={busy}
                  onChange={(event) => setDueMonth(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </label>
            </div>
          )}

          {kind === 'CARD' && result?.invoiceSummary && <CardInvoiceSummaryPreview key={result.hash} summary={result.invoiceSummary} onSave={saveSummary} />}
          {destinationMismatch && <p role="alert" className="text-xs text-rose-300">Banco da fatura diferente do cartão selecionado. Não é seguro alocar automaticamente.</p>}

          {duplicateKeys.size > 0 && <label className="flex items-start gap-2 text-xs text-amber-200">
            <input type="checkbox" checked={allowDuplicates} onChange={event => setAllowDuplicates(event.target.checked)}/>
            {duplicateKeys.size} possível(is) repetição(ões) já importada(s). Permitir novamente somente após conferir.
          </label>}
          {pdfPasswordRequired && source && <form className="space-y-2 rounded-xl border border-amber-600/30 bg-slate-950 p-3"
            onSubmit={event => { event.preventDefault(); if (pdfPassword && !busy) void parse(false, pdfPassword); }}>
            <label className="block text-xs text-slate-200" htmlFor="modal-wallet-pdf-password">Senha do PDF (leitura local)</label>
            <div className="flex gap-2">
              <input id="modal-wallet-pdf-password" type="password" autoComplete="off" maxLength={256}
                value={pdfPassword} onChange={event => setPdfPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                placeholder="Senha do arquivo"/>
              <button type="submit" disabled={busy || !pdfPassword} className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-40">Desbloquear e ler</button>
            </div>
            <p className="text-[11px] text-slate-400">A senha não é salva nem transmitida ao servidor.</p>
          </form>}
          {/* Upload Area */}
          <div className="space-y-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/80 p-6 text-center hover:border-cyan-500/70 hover:bg-slate-950 transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-cyan-400">
                <UploadCloud size={26} />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-semibold text-slate-200">
                  {source?.name || 'Clique ou arraste a fatura, extrato ou print aqui'}
                </span>
                <p className="text-xs text-slate-400">
                  Formatos aceitos: <strong>.OFX</strong>, <strong>.PDF</strong>, ou imagens/prints (<strong>PNG, JPG, WEBP</strong>) até 15 MB
                </p>
              </div>

              {source && (
                <div className="mt-1 flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs text-cyan-300 border border-slate-700">
                  {isOfx ? <Building2 size={14} /> : isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                  <span>{source.name}</span>
                  <span className="text-slate-400 text-[10px]">({(source.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}

              <input
                type="file"
                accept=".ofx,.qfx,.pdf,application/pdf,image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setSource(f);
                  setPdfPassword('');
                  setPdfPasswordRequired(false);
                  setResult(null);
                  setRows([]);
                  setError('');
                  setFinished(null);
                  setShowPreview(false);
                }}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <button
                disabled={!source || busy}
                onClick={() => void parse()}
                type="button"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 transition"
              >
                {busy ? (
                  <>
                    <Sparkles size={16} className="animate-spin" />
                    Processando com IA / Parser...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Dissecar Fatura ou Extrato
                  </>
                )}
              </button>

              {result?.previewUrl && (
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <ImageIcon size={15} />
                  {showPreview ? 'Ocultar print' : 'Ver print da fatura'}
                  {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Prévia da Imagem / Print */}
          {showPreview && result?.previewUrl && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-[11px] font-semibold text-slate-400 mb-2">Print ou comprovante enviado:</p>
              <div className="max-h-60 overflow-auto rounded-lg border border-slate-800 bg-black flex justify-center">
                <img src={result.previewUrl} alt="Prévia da fatura" className="max-w-full object-contain" />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-xs text-rose-300">
              <AlertTriangle size={18} className="shrink-0 text-rose-400 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {finished !== null && (
            <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 text-sm text-emerald-300">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span><strong>{finished} lançamento(s)</strong> registrados com sucesso no sistema!</span>
            </div>
          )}

          {isPdf && source && !busy && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3 text-xs text-slate-200">
              <span className="min-w-0 flex-1">Se a leitura local falhou, a IA pode analisar o PDF. Isso envia o documento ao Google Gemini e pode gerar custos.</span>
              <button type="button" className="min-h-10 rounded-lg border border-cyan-500/50 px-3 py-2 font-semibold text-cyan-200" onClick={() => {
                if (!window.confirm('Enviar este PDF financeiro ao Google Gemini? O documento pode conter dados bancários e pessoais. A leitura pode gerar custos de API.')) return;
                void parse(true);
              }}>Ler PDF com IA</button>
            </div>
          )}

          {/* Resultados Identificados */}
          {result && result.rows.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Header do Resultado */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                    {result.costLabel}
                  </span>
                  {result.institutionDetected && (
                    <span className="font-semibold text-slate-200">
                      Banco: {result.institutionDetected}
                    </span>
                  )}
                  <span className="text-slate-400">
                    · {result.rows.length} lançamento(s) encontrados
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline"
                    disabled={busy}
                    onClick={() =>
                      setRows((current) =>
                        current.map((x) => ({ ...x, selected: true }))
                      )
                    }
                  >
                    Marcar todos
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-200 text-xs underline"
                    disabled={busy}
                    onClick={() =>
                      setRows((current) =>
                        current.map((x) => ({ ...x, selected: false }))
                      )
                    }
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {/* Tabela de Lançamentos */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {rows.map((row, i) => (
                  <div
                    key={row.rowKey}
                    className={`grid grid-cols-[auto_1fr] gap-3 rounded-xl border p-3 transition ${
                      row.selected
                        ? 'border-cyan-700/60 bg-slate-950/90'
                        : 'border-slate-800 bg-slate-950/40 opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 rounded accent-cyan-500 cursor-pointer"
                      checked={row.selected}
                      disabled={busy}
                      onChange={(e) => revise(i, { selected: e.target.checked })}
                      aria-label={`Incluir linha ${i + 1}`}
                    />

                    <div className="grid min-w-0 gap-2 sm:grid-cols-[115px_1fr_135px]">
                      {/* Data */}
                      <input
                        type="date"
                        aria-label="Data do lançamento"
                        value={row.date}
                        disabled={busy}
                        onChange={(e) => revise(i, { date: e.target.value })}
                        className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                      />

                      {/* Descrição & Parcelas */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <input
                          aria-label="Descrição do lançamento"
                          value={row.description}
                          disabled={busy}
                          maxLength={240}
                          onChange={(e) => revise(i, { description: e.target.value })}
                          className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                        />
                        {row.installmentNumber && row.installmentTotal && (
                          <span className="text-[10px] text-cyan-400 font-medium">
                            Parcela {row.installmentNumber}/{row.installmentTotal} detectada
                          </span>
                        )}
                      </div>

                      {/* Valor */}
                      <div className="text-right">
                        <input
                          type="text" inputMode="decimal"
                          step="0.01"
                          aria-label="Valor do lançamento; positivo entrada, negativo saída"
                          className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-xs font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                          disabled={busy}
                          value={rowAmountDrafts[row.rowKey] ?? String(row.amount).replace('.', ',')}
                          onChange={(e) => {
                      const raw = e.target.value;
                      setRowAmountDrafts(previous => ({ ...previous, [row.rowKey]: raw }));
                      const parsed = tryParseWalletSignedMoney(raw);
                      if (parsed !== null) revise(i, { amount: parsed });
                    }}
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formatMoney(row.amount)}
                        </p>
                      </div>

                      {/* Categoria */}
                      <div className="sm:col-span-3 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 shrink-0">Categoria:</span>
                        <select
                          disabled={busy}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                          value={row.category}
                          onChange={(e) => revise(i, { category: e.target.value })}
                        >
                          {[...categories, ...extraCategories].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-700 p-4 bg-slate-950/70">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
            <span className="text-xs text-slate-400">
              <strong>{selectedCount}</strong> selecionado(s)
            </span>
            {selectedCount > 0 && (
              <span className="text-xs font-mono font-semibold text-cyan-300">
                Total: {formatMoney(selectedSum)}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={busy || !result || selectedCount === 0 || selectedInvalid}
              onClick={save}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 disabled:opacity-40 transition"
            >
              {busy ? 'Registrando...' : 'Confirmar itens selecionados'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
