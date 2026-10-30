import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Zap,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { CardInvoiceSummaryPreview } from './CardInvoiceSummaryPreview';
import { personalWalletService } from '../../services/personalWallet.service';
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
  initialFile?: File;
  initialDueMonth?: string | null;
  hasOpening?: boolean;
  onClose?: () => void;
  onImported: () => Promise<void>;
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
  initialFile,
  initialDueMonth,
  hasOpening = false,
  onClose,
  onImported,
  isFlat = true,
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
  const [showPreview, setShowPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const declaredBank = result?.invoiceSummary?.institution;
  const bankMismatch = Boolean(kind === 'CARD' && targetIssuer && declaredBank
    && !targetIssuer.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(
      declaredBank.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  const selectedCount = rows.filter((row) => row.selected).length;
  const selectedSum = rows
    .filter((row) => row.selected)
    .reduce((sum, row) => sum + row.amount, 0);

  const selectedInvalid = rows.some(
    (row) =>
      row.selected &&
      (!Number.isFinite(row.amount) ||
        row.amount === 0 ||
        Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.0001 ||
        !row.date ||
        !row.description.trim())
  );

  const handleFileProcess = async (fileToProcess: File, forceAi = false) => {
    setSource(fileToProcess);
    setResult(null);
    setRows([]);
    setError('');
    setFinished(null);
    setShowPreview(false);
    setBusy(true);

    try {
      const parsed = await parseSmartFinancialDocument(fileToProcess, kind, { forceAi });
      setResult(parsed);
      setRows(parsed.rows);

      if (!parsed.rows.length) {
        setError(
          fileToProcess.name.toLowerCase().endsWith('.pdf')
            ? 'A leitura local não encontrou compras. Este PDF pode ser digitalizado ou usar um layout não reconhecido. Você pode tentar a leitura com IA abaixo.'
            : 'Não foram encontradas transações válidas. Confira se o arquivo contém um extrato detalhado.'
        );
      } else if (parsed.previewUrl) {
        setShowPreview(true);
      }
    } catch (reason: any) {
      setResult(null);
      setRows([]);
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
    if (bankMismatch) { setError('Esta fatura é de outra instituição. Selecione o cartão correto antes de importar.'); return; }
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
  const isImage =
    source?.type.startsWith('image/') ||
    /\.(png|jpe?g|webp)$/i.test(source?.name || '');
  const isOfx =
    source?.name?.toLowerCase().endsWith('.ofx') ||
    source?.name?.toLowerCase().endsWith('.qfx');

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

      {/* OFX e PDFs nativos são locais, IA só mediante ação explícita. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Zap size={16} className="shrink-0 text-emerald-400" />
          <span>
            <strong className="text-white">OFX e PDF com texto</strong> · leitura local
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="shrink-0 text-indigo-400" />
          <span>
            <strong className="text-white">Imagens e PDF digitalizado</strong> · IA opcional
          </span>
        </div>
      </div>

      {/* Configuração de Destino do Cartão */}
      {kind === 'CARD' && (
        <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-2">
          <label className="text-xs text-slate-300 font-medium">
            Como registrar na fatura
            <select
              disabled={busy}
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="NEW">Novos gastos — somar ao limite usado da fatura</option>
              <option value="INCLUDED">Já incluídos na situação inicial da fatura</option>
              <option value="DOCUMENT">Somente conferência — não alterar limites/saldos</option>
            </select>
          </label>

          <label className="text-xs text-slate-300 font-medium">
            Mês de vencimento
            <input
              required
              type="month"
              value={dueMonth}
              disabled={busy}
              onChange={(event) => setDueMonth(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </label>
        </div>
      )}

      {kind === 'CARD' && result?.invoiceSummary && <CardInvoiceSummaryPreview summary={result.invoiceSummary} />}
      {bankMismatch && <p role="alert" className="text-xs text-rose-300">O banco identificado nesta fatura é diferente do cartão de destino. Selecione o cartão correto.</p>}

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
          if (f) void handleFileProcess(f);
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
            Suporta faturas <strong>OFX</strong>, <strong>PDF</strong> ou <strong>Prints de tela / Fotos</strong> (PNG, JPG, WEBP)
          </p>
        </div>

        <label className="mt-1 cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white transition">
          {busy ? 'Processando arquivo...' : 'Selecionar do Computador ou Celular'}
          <input
            type="file"
            accept=".ofx,.qfx,.pdf,application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileProcess(f);
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

      {/* Prévia da Imagem (se for print/comprovante) */}
      {result?.previewUrl && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center justify-between w-full text-xs text-cyan-400 font-medium"
          >
            <span className="flex items-center gap-1.5">
              <ImageIcon size={14} />
              {showPreview ? 'Ocultar print da fatura' : 'Ver print da fatura para conferência'}
            </span>
            {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showPreview && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-800 bg-black flex justify-center">
              <img src={result.previewUrl} alt="Prévia" className="max-w-full object-contain" />
            </div>
          )}
        </div>
      )}

      {/* Envio para IA somente após consentimento explícito. */}
      {isPdf && source && !busy && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-800/50 bg-cyan-950/20 px-3 py-2.5 text-xs text-slate-200">
          <span className="min-w-0 flex-1">PDF com compras ausentes? A leitura com IA envia o documento ao Google Gemini e pode gerar custos.</span>
          <button type="button" onClick={() => {
            if (!window.confirm('Enviar este PDF financeiro ao Google Gemini para análise? O arquivo pode conter dados pessoais e bancários. Esta ação pode gerar custos de API.')) return;
            void handleFileProcess(source, true);
          }} className="min-h-10 rounded-lg border border-cyan-600/60 px-3 py-2 font-semibold text-cyan-200 hover:bg-cyan-950/50">Ler PDF com IA</button>
        </div>
      )}

      {/* Lista Plana de Lançamentos Extraídos */}
      {result && result.rows.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800">
                {result.costLabel}
              </span>
              {result.institutionDetected && (
                <span className="font-semibold text-slate-200">
                  {result.institutionDetected}
                </span>
              )}
              <span className="text-slate-400">
                · {result.rows.length} itens encontrados
              </span>
            </div>

            <div className="flex items-center gap-3">
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

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map((row, i) => (
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
                  onChange={(e) => revise(i, { selected: e.target.checked })}
                  aria-label={`Incluir linha ${i + 1}`}
                />

                <div className="grid min-w-0 gap-2 sm:grid-cols-[115px_1fr_130px]">
                  <input
                    type="date"
                    aria-label="Data"
                    value={row.date}
                    disabled={busy}
                    onChange={(e) => revise(i, { date: e.target.value })}
                    className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />

                  <div className="flex flex-col gap-0.5 min-w-0">
                    <input
                      aria-label="Descrição"
                      value={row.description}
                      disabled={busy}
                      maxLength={240}
                      onChange={(e) => revise(i, { description: e.target.value })}
                      className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                    {row.installmentNumber && row.installmentTotal && (
                      <span className="text-[10px] text-cyan-400 font-medium">
                        Parcela {row.installmentNumber}/{row.installmentTotal}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <input
                      type="number"
                      step="0.01"
                      aria-label="Valor"
                      className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-xs font-mono font-bold text-white focus:border-cyan-500 focus:outline-none"
                      disabled={busy}
                      value={row.amount}
                      onChange={(e) => revise(i, { amount: Number(e.target.value) })}
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatMoney(row.amount)}
                    </p>
                  </div>

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

          {/* Rodapé de Confirmação */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <div className="flex items-center gap-3">
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
                disabled={busy || !result || selectedCount === 0 || selectedInvalid}
                onClick={save}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-40 transition"
              >
                {busy ? 'Registrando...' : 'Confirmar itens selecionados'}
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
