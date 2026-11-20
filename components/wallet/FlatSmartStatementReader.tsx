import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Zap,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { FinancialCalculatorInput } from '../forms/FinancialCalculatorInput';
import { parseWalletSignedMoney } from '../../features/wallet/utils/parseWalletMoney';
import { CardInvoiceSummaryPreview } from './CardInvoiceSummaryPreview';
import { getInvoiceCycleDates } from './invoiceStatementDomain';
import { issuerMatchesBank, type CardInvoiceSummary } from '../../utils/cardInvoiceSummary';
import { detectPreviouslyImported, detectRecoverableStatementRows } from '../../utils/walletStatementDuplicates';
import type { WalletStatementRow } from '../../services/personalWallet.service';
import { personalWalletService } from '../../services/personalWallet.service';
import type { WalletIssuerInvoiceCommit } from '../../services/personalWallet.service';
import {
  calculateStatementTotals,
  isCardInvoicePaymentDescription,
  matchesStatementRowSearch,
  parseStatementPdf,
  ParsedStatementRow,
} from '../../utils/walletStatementPdf';
import { generateUUID } from '../../utils/generators';
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
  targetCreditLimit?: number | null;
  targetEstimatedUsedLimit?: number | null;
  targetEstimatedFutureCommitments?: number | null;
  targetEstimatedAvailableLimit?: number | null;
  targetEstimateDueMonth?: string | null;
  existingRows?: WalletStatementRow[];
  initialFile?: File;
  initialDueMonth?: string | null;
  closingDay?: number | null;
  dueDay?: number | null;
  hasOpening?: boolean;
  onClose?: () => void;
  onImported: () => Promise<void>;
  onSummarySaved?: (dueMonth: string) => Promise<void>;
  isFlat?: boolean; // Se true, renderiza inline / plano sem fundo de modal fixo
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

export const FlatSmartStatementReader: React.FC<Props> = ({
  kind,
  targetId,
  targetName,
  targetIssuer,
  targetLastFour,
  targetCreditLimit,
  targetEstimatedUsedLimit,
  targetEstimatedFutureCommitments,
  targetEstimatedAvailableLimit,
  targetEstimateDueMonth,
  existingRows = [],
  initialFile,
  initialDueMonth,
  closingDay,
  dueDay,
  hasOpening = false,
  onClose,
  onImported,
  onSummarySaved,
  isFlat = true,
}) => {
  const [mode, setMode] = useState<'NEW' | 'INCLUDED' | 'DOCUMENT' | 'REVIEW'>('NEW');
  const [dueMonth, setDueMonth] = useState(
    (initialDueMonth || new Date().toLocaleDateString('en-CA')).slice(0, 7)
  );
  const [source, setSource] = useState<File | null>(null);
  const [result, setResult] = useState<SmartStatementParseResult | null>(null);
  const [rows, setRows] = useState<ParsedStatementRow[]>([]);
  const [rowSearch, setRowSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<number | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfPasswordRequired, setPdfPasswordRequired] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reviewedRows, setReviewedRows] = useState<WalletStatementRow[]>([]);
  const [confirmedOpening, setConfirmedOpening] = useState<{ cardId: string; month: string } | null>(null);
  const confirmationAttempt = useRef<{ signature: string; requestId: string } | null>(null);
  const previousTarget = useRef(kind + ':' + targetId);
  useEffect(() => {
    const nextTarget = kind + ':' + targetId;
    if (previousTarget.current === nextTarget) return;
    previousTarget.current = nextTarget;
    setSource(null);
    setResult(null);
    setRows([]);
    setRowSearch('');
    setReviewedRows([]);
    setAllowDuplicates(false);
    setConfirmedOpening(null);
    confirmationAttempt.current = null;
    setMode('NEW');
  }, [kind, targetId]);
  const changeDueMonth = (month: string) => {
    if (month !== dueMonth) setMode(confirmedOpening?.month === month ? 'INCLUDED' : 'NEW');
    setDueMonth(month);
  };

  const declaredBank = result?.invoiceSummary?.institution;
  const bankMismatch = kind === 'CARD' && !issuerMatchesBank(targetIssuer, declaredBank || null);
  const duplicateKeys = detectPreviouslyImported(rows, [...existingRows, ...reviewedRows], kind, targetId, result?.hash);
  const recoverableKeys = result && kind === 'CARD' && mode !== 'DOCUMENT'
    ? detectRecoverableStatementRows(rows, [...existingRows, ...reviewedRows], kind, targetId, result.hash)
    : new Set<string>();
  const selectedDuplicates = rows.filter(row => row.selected && duplicateKeys.has(row.rowKey) && !recoverableKeys.has(row.rowKey));
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
    const payload = {
      cardId:targetId, dueMonth:referenceMonth+'-01', dueDate:summary.dueDate,
      issuer:summary.institution, invoiceTotal:summary.invoiceTotal,
      minimumPayment:summary.minimumPayment, creditLimit:summary.creditLimit,
      usedLimit:summary.usedLimit, availableLimit:summary.availableLimit,
      futureInstallments:summary.futureInstallments, sourceHash:result.hash,
      sourceType:result.sourceType === 'OFX' ? 'OFX' :
        result.sourceType === 'PDF_NATIVE' || result.sourceType === 'PDF_AI' ? 'PDF' : 'MANUAL',
    } as const;
    const signature = JSON.stringify(payload);
    if (confirmationAttempt.current?.signature !== signature)
      confirmationAttempt.current = { signature, requestId: generateUUID() };
    const confirmation = await personalWalletService.saveCardInvoiceFacts(payload, confirmationAttempt.current.requestId);
    setDueMonth(referenceMonth);
    if (confirmation.financial_applied) {
      setConfirmedOpening({ cardId: targetId, month: referenceMonth });
      if (mode !== 'DOCUMENT') setMode('INCLUDED');
    } else if (referenceMonth !== dueMonth) {
      setMode('NEW');
    }
    await onSummarySaved?.(referenceMonth+'-01');
    return confirmation;
  };

  const selectedCount = rows.filter((row) => row.selected).length;
  const visibleRows = rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => matchesStatementRowSearch(row, rowSearch));
  const invoiceRows = kind === 'CARD'
    ? rows.filter((row) => !isCardInvoicePaymentDescription(row.description))
    : rows;
  const extractedTotals = calculateStatementTotals(invoiceRows, result?.invoiceSummary?.invoiceTotal);
  const selectedTotals = calculateStatementTotals(rows.filter((row) => row.selected));

  const selectedInvalid = rows.some(
    (row) =>
      row.selected &&
      (!Number.isFinite(row.amount) ||
        row.amount === 0 ||
        Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.0001 ||
        !row.date ||
        !row.description.trim())
  );

  const handleFileProcess = async (fileToProcess: File, forceAi = false, password?: string) => {
    setSource(fileToProcess);
    setResult(null);
    setRows([]);
    setRowSearch('');
    setReviewedRows([]);
    setError('');
    setPdfPasswordRequired(false);
    setFinished(null);
    if (fileToProcess.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileToProcess.name) || forceAi) {
      setError('A leitura de faturas por imagem/IA foi desativada. Envie o arquivo PDF original do banco ou OFX.');
      return;
    }
    setBusy(true);

    try {
      const parsed = await parseSmartFinancialDocument(fileToProcess, kind, {
        pdfPassword: password,
      });
      setPdfPassword('');
      if (kind === 'CARD' && parsed.invoiceSummary?.dueDate) changeDueMonth(parsed.invoiceSummary.dueDate.slice(0,7));
      setResult(parsed);
      const recoverable = detectRecoverableStatementRows(parsed.rows, existingRows, kind, targetId, parsed.hash);
      setRows(parsed.rows.map(row => recoverable.has(row.rowKey)
        ? { ...row, selected: kind === 'CARD' && mode !== 'DOCUMENT' }
        : detectPreviouslyImported([row], existingRows, kind, targetId, parsed.hash).has(row.rowKey)
          ? { ...row, selected: false }
          : { ...row, selected: kind === 'CARD' ? !isCardInvoicePaymentDescription(row.description) : true }));
      setAllowDuplicates(false);

      if (!parsed.rows.length) {
        setError(
          fileToProcess.name.toLowerCase().endsWith('.pdf')
            ? 'A leitura local não encontrou compras neste PDF. Use o PDF original com texto exportado pelo banco ou o arquivo OFX.'
            : 'Não foram encontradas transações válidas. Confira se o arquivo contém um extrato detalhado.'
        );
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

  const importedFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (!initialFile || importedFileRef.current === initialFile) return;
    importedFileRef.current = initialFile;
    void handleFileProcess(initialFile);
    // Intent data is a stable File reference for the lifetime of this reader.
  }, [initialFile]);

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
    if (!result || !selectedCount || selectedInvalid || mode === 'REVIEW') {
      setError('Revise os valores, as datas e as descrições selecionadas.');
      return;
    }
    setBusy(true);
    setError('');
    let recorded = 0;
    try {
      const selected = rows.filter(row => row.selected);
      const latestRows = await personalWalletService.getStatementRowsForReview(
        kind, targetId, selected.map(row => row.date),
      );
      setReviewedRows(latestRows);
      const freshDuplicates = detectPreviouslyImported(selected, latestRows, kind, targetId, result.hash);
      const recoverable = kind === 'CARD' && mode !== 'DOCUMENT'
        ? detectRecoverableStatementRows(selected, latestRows, kind, targetId, result.hash)
        : new Set<string>();
      // Defesa independente: mesmo se o detector flexível falhar, data, cartão,
      // centavos e estabelecimento idênticos exigem confirmação de duplicidade.
      const directDuplicates = selected.filter(row => latestRows.some(previous =>
        previous.target_kind === kind && previous.target_id === targetId
        && previous.document_hash !== result.hash
        && previous.entry_date === row.date
        && Math.round(Number(previous.amount) * 100) === Math.round(row.amount * 100)
        && String(previous.description).localeCompare(row.description, 'pt-BR', { sensitivity: 'base' }) === 0
      )).map(row => row.rowKey);
      const blockedDuplicates = new Set([...freshDuplicates, ...directDuplicates]);
      if ([...blockedDuplicates].some(key => !recoverable.has(key)) && !allowDuplicates) {
        setError('Há lançamentos já importados de outro arquivo. Desmarque-os ou autorize explicitamente a repetição após conferir no banco.');
        return;
      }
      for (const row of selected) {
        if (kind === 'CARD' && mode !== 'DOCUMENT') {
          if (row.amount <= 0 && isCardInvoicePaymentDescription(row.description)) {
            throw new Error('Desmarque pagamentos de fatura anterior. Créditos e estornos de compras podem ser importados normalmente.');
          }
          // Uma única transação no banco: linha, compra (ou crédito/estorno) e parcelas futuras são gravadas atomicamente.
          await personalWalletService.recordAndImportCardStatementPurchase({
            cardId: targetId, documentHash: result.hash, rowKey: row.rowKey,
            date: row.date, description: row.description, amount: row.amount,
            category: row.category, dueMonth: dueMonth + '-01',
            included: mode === 'INCLUDED', allowDuplicates,
            installmentNumber: row.installmentNumber,
            installmentTotal: row.installmentTotal,
          });
        } else {
          await personalWalletService.recordStatementRow({
            targetKind: kind, targetId, documentHash: result.hash, rowKey: row.rowKey,
            date: row.date, description: row.description, amount: row.amount,
            category: row.category, installmentNumber: row.installmentNumber,
            installmentTotal: row.installmentTotal,
          });
        }
        recorded++;
      }
      await onImported();
      setFinished(recorded);
      setRows((current) => current.map((row) => ({ ...row, selected: false })));
    } catch (reason: any) {
      if (recorded > 0) await onImported().catch(() => {});
      setError(
        `${recorded} lançamento(s) processados. ${
          reason?.message || 'Falha no registro.'
        } Repita a seleção para retomar sem duplicar.`
      );
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <div className="space-y-4">
      {/* Header Plano */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-md">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Importar fatura ou extrato
              <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-800">
                Conferência obrigatória
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Importação para <strong className="text-slate-200">{targetName}</strong> ({kind === 'CARD' ? 'Cartão' : 'Conta'})
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* OFX e PDFs nativos são 100% locais, sem envio para IA externa. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Zap size={16} className="shrink-0 text-emerald-400" />
          <span>
            <strong className="text-white">OFX e PDF com texto</strong> · leitura 100% local no dispositivo
          </span>
        </div>
      </div>

      {/* Configuração de Destino do Cartão */}
      {kind === 'CARD' && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <label className="block text-xs text-slate-300 font-medium">
            Mês de vencimento (pagamento)
            <input
              required
              type="month"
              value={dueMonth}
              disabled={busy}
              onChange={(event) => changeDueMonth(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
            {(() => {
              if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dueMonth) || (!closingDay && !dueDay)) return null;
              try {
                const dates = getInvoiceCycleDates(dueMonth + '-01', closingDay ?? null, dueDay ?? null);
                const closeFmt = `${dates.closingDate.slice(8, 10)}/${dates.closingDate.slice(5, 7)}/${dates.closingDate.slice(0, 4)}`;
                const dueFmt = `${dates.dueDate.slice(8, 10)}/${dates.dueDate.slice(5, 7)}/${dates.dueDate.slice(0, 4)}`;
                return (
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    Apuração até {closeFmt} · Vence em {dueFmt}
                  </span>
                );
              } catch {
                return null;
              }
            })()}
          </label>

          <details className="pt-1 text-[11px] text-slate-400">
            <summary className="cursor-pointer font-medium text-slate-400 hover:text-slate-200">
              Opções avançadas de registro
            </summary>
            <label className="mt-2 block text-xs text-slate-300 font-medium">
              Modo de lançamento
              <select
                disabled={busy}
                value={mode}
                onChange={(event) => setMode(event.target.value as typeof mode)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="NEW">Lançar compras na fatura (padrão)</option>
                <option value="INCLUDED">Detalhar fatura inicial já registrada</option>
                <option value="DOCUMENT">Somente conferência — não alterar fatura</option>
              </select>
            </label>
          </details>
        </div>
      )}

      {kind === 'CARD' && result?.invoiceSummary && <CardInvoiceSummaryPreview key={result.hash} summary={result.invoiceSummary}
        suggestedCreditLimit={targetCreditLimit}
        statementRows={rows}
        suggestedDueDate={(() => {
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dueMonth) || !dueDay) return null;
          try { return getInvoiceCycleDates(dueMonth + '-01', closingDay ?? null, dueDay).dueDate; } catch { return null; }
        })()}
        estimatedUsedLimit={targetEstimatedUsedLimit}
        estimatedFutureCommitments={targetEstimatedFutureCommitments}
        estimatedAvailableLimit={targetEstimatedAvailableLimit} estimatedDueMonth={targetEstimateDueMonth}
        dueMonth={dueMonth + '-01'} onSave={saveSummary} />}
      {destinationMismatch && (
        <p role="alert" className="text-xs text-rose-300">
          {bankMismatch
            ? `O banco identificado nesta fatura (${declaredBank}) é diferente do cartão de destino (${targetIssuer || targetName}). Selecione o cartão correto.`
            : `O final de cartão identificado nesta fatura (•••• ${result?.invoiceSummary?.cardLastFour}) é diferente do final cadastrado neste cartão (•••• ${targetLastFour}). Selecione o cartão correto ou ajuste os 4 últimos dígitos no cadastro do cartão.`}
        </p>
      )}

      {duplicateKeys.size > 0 && <label className="flex items-start gap-2 text-xs text-amber-200">
        <input type="checkbox" checked={allowDuplicates} onChange={event => setAllowDuplicates(event.target.checked)}/>
        {duplicateKeys.size} possível(is) repetição(ões) já importada(s). Repetir somente após conferência.
      </label>}
      {/* Área Plana de Drag & Drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) { setPdfPassword(''); void handleFileProcess(f); }
        }}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/30'
            : 'border-slate-700 bg-slate-950/70 hover:border-slate-500 hover:bg-slate-950'
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-cyan-400">
          <UploadCloud size={24} />
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-slate-200">
            {source ? source.name : 'Arraste ou solte o arquivo aqui'}
          </p>
          <p className="text-xs text-slate-400">
            Suporta faturas e extratos em <strong>OFX</strong> ou <strong>PDF com texto</strong> (leitura local)
          </p>
        </div>

        <label className="mt-1 cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white transition">
          {busy ? 'Processando arquivo...' : 'Selecionar do Computador ou Celular'}
          <input
            type="file"
            accept=".ofx,.qfx,.pdf,application/pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setPdfPassword(''); void handleFileProcess(f); }
            }}
          />
        </label>
      </div>

      {/* Alertas e Mensagens */}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-xs text-rose-300">
          <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {finished !== null && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span><strong>{finished} lançamento(s)</strong> registrados com sucesso!</span>
        </div>
      )}

      {pdfPasswordRequired && source && <form className="space-y-2 rounded-xl border border-amber-600/30 bg-slate-950 p-3"
        onSubmit={event => { event.preventDefault(); if (pdfPassword && !busy) void handleFileProcess(source, false, pdfPassword); }}>
        <label className="block text-xs text-slate-200" htmlFor="flat-wallet-pdf-password">Senha do PDF (somente neste dispositivo)</label>
        <div className="flex gap-2">
          <input id="flat-wallet-pdf-password" type="password" autoComplete="off" maxLength={256}
            value={pdfPassword} onChange={event => setPdfPassword(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="Informe a senha"/>
          <button type="submit" disabled={busy || !pdfPassword} className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-40">Desbloquear e ler</button>
        </div>
        <p className="text-[11px] text-slate-400">A senha não é salva nem transmitida ao servidor.</p>
      </form>}
      {/* Lista Plana de Lançamentos Extraídos */}
      {result && result.rows.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                {result.costLabel}
              </span>
              {result.institutionDetected && (
                <span className="font-semibold text-slate-200">
                  {result.institutionDetected}
                </span>
              )}
              <span className="text-slate-400">
                · {visibleRows.length} de {rows.length} itens
              </span>
            </div>

            <label className="order-3 flex min-h-9 basis-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-slate-400 sm:order-none sm:basis-64">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar lançamentos por nome, data, valor, categoria ou parcela"
                placeholder="Buscar lançamento…"
                value={rowSearch}
                onChange={event => setRowSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
              />
            </label>

            <div className="order-2 flex shrink-0 items-center gap-3 sm:order-none">
              <button
                type="button"
                className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline"
                disabled={busy}
                onClick={() =>
                  setRows((current) =>
                    current.map((x) => ({ ...x, selected: kind !== 'CARD' || x.amount > 0 }))
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

          <section
            aria-label="Comparação do total apurado com a fatura"
            className="grid grid-cols-1 gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-xs sm:grid-cols-3 sm:gap-3"
          >
            <div className="flex items-center justify-between gap-3 sm:block">
              <div>
                <span className="text-slate-400">
                  {kind === 'CARD' ? 'Compras apuradas' : 'Total apurado'} ({invoiceRows.length})
                </span>
                {extractedTotals.invalidAmountCount > 0 && (
                  <p className="text-[10px] text-amber-300">
                    {extractedTotals.invalidAmountCount} valor(es) inválido(s); corrija para comparar.
                  </p>
                )}
              </div>
              <strong className={`tabular-nums ${extractedTotals.invalidAmountCount ? 'text-amber-300' : 'text-cyan-300'}`}>
                {extractedTotals.invalidAmountCount
                  ? 'Não calculável'
                  : formatMoney(extractedTotals.extractedTotalCents / 100)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-1.5 sm:block sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
              <span className="text-slate-400">Total da fatura no PDF</span>
              <strong className="tabular-nums text-white">
                {extractedTotals.invoiceTotalCents === null
                  ? 'Não identificado'
                  : formatMoney(extractedTotals.invoiceTotalCents / 100)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-1.5 sm:block sm:border-l sm:pt-0 sm:pl-3">
              <span className="text-slate-400">Diferença (fatura − apurado)</span>
              <strong className={`tabular-nums ${extractedTotals.differenceCents === null
                ? 'text-slate-500'
                : extractedTotals.differenceCents === 0
                  ? 'text-emerald-300'
                  : 'text-amber-300'}`}>
                {extractedTotals.differenceCents === null
                  ? '—'
                  : extractedTotals.differenceCents === 0
                    ? 'R$ 0,00 · confere'
                    : `${extractedTotals.differenceCents > 0 ? '+' : '−'}${formatMoney(Math.abs(extractedTotals.differenceCents) / 100)}`}
              </strong>
            </div>
          </section>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {visibleRows.map(({ row, index }) => (
              <div
                key={row.rowKey}
                className={`grid grid-cols-[auto_1fr] gap-3 rounded-xl border p-2.5 transition ${
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
                  onChange={(e) => revise(index, { selected: e.target.checked })}
                  aria-label={`Incluir linha ${index + 1}`}
                />

                <div className="grid min-w-0 gap-2 sm:grid-cols-[115px_1fr_130px]">
                  <input
                    type="date"
                    aria-label="Data"
                    value={row.date}
                    disabled={busy}
                    onChange={(e) => revise(index, { date: e.target.value })}
                    className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />

                  <div className="flex flex-col gap-0.5 min-w-0">
                    <input
                      aria-label="Descrição"
                      value={row.description}
                      disabled={busy}
                      maxLength={240}
                      onChange={(e) => revise(index, { description: e.target.value })}
                      className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                    {row.installmentNumber && row.installmentTotal && (
                      <span className="text-[10px] text-cyan-400 font-medium">
                        Parcela {row.installmentNumber}/{row.installmentTotal}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <FinancialCalculatorInput signed centsEntry
                    aria-label="Valor"
                    className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                    disabled={busy} value={row.amount}
                    onCommit={raw => revise(index, { amount: raw ? parseWalletSignedMoney(raw, 'valor do lançamento') : 0 })}
                  />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatMoney(row.amount)}
                    </p>
                  </div>

                  <div className="sm:col-span-3 flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 shrink-0">Categoria:</span>
                    <select
                      disabled={busy}
                      className="w-full min-w-0 sm:max-w-64 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={row.category}
                      onChange={(e) => revise(index, { category: e.target.value })}
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
            {visibleRows.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center text-xs text-slate-400">
                Nenhum lançamento corresponde à busca.
              </p>
            )}
          </div>

          {/* Aviso explícito quando o botão de confirmação estiver bloqueado */}
          {!busy && selectedCount > 0 && (mode === 'REVIEW' || selectedInvalid) && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={15} className="shrink-0 text-amber-400 mt-0.5" />
              <span>
                {mode === 'REVIEW'
                  ? 'Para liberar a importação, role até o topo e escolha uma opção em "Como registrar na fatura" (Novos gastos, Já incluídos ou Somente conferência).'
                  : 'Há lançamento selecionado com data, descrição ou valor inválido. Revise ou desmarque o item para continuar.'}
              </span>
            </div>
          )}

          {/* Rodapé de Confirmação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                <strong>{selectedCount}</strong> selecionado(s)
              </span>
              <span className="text-xs font-mono font-semibold text-cyan-300">
                Selecionado para importar: {formatMoney(selectedTotals.extractedTotalCents / 100)}
              </span>
            </div>

            <div className="flex gap-2">
              {onClose && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                disabled={busy || !result || selectedCount === 0 || selectedInvalid || mode === 'REVIEW'}
                onClick={save}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-40 transition"
              >
                {busy ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isFlat) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 text-white shadow-xl">
        {content}
      </section>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/90 p-2 sm:p-5 backdrop-blur-sm"
    >
      <section className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl p-4 sm:p-5">
        {content}
      </section>
    </div>
  );
};
