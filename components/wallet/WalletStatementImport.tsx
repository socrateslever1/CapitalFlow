import React, { useState } from 'react';
import { FileText, UploadCloud, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { personalWalletService } from '../../services/personalWallet.service';
import { parseStatementPdf, ParsedStatementRow, StatementParseResult } from '../../utils/walletStatementPdf';

type Props = {
  kind: 'ACCOUNT' | 'CARD';
  targetId: string;
  targetName: string;
  onClose: () => void;
  onImported: () => Promise<void>;
};
const categories = ['Outros', 'Alimentação', 'Transporte', 'Saúde', 'Contas da casa', 'Salário', 'Transferências', 'Lazer', 'Educação', 'Serviços'];
export const WalletStatementImport: React.FC<Props> = ({ kind, targetId, targetName, onClose, onImported }) => {
  const [source, setSource] = useState<File | null>(null);
  const [result, setResult] = useState<StatementParseResult | null>(null);
  const [rows, setRows] = useState<ParsedStatementRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState<number | null>(null);
  const selectedCount = rows.filter(row=>row.selected).length;

  const parse = async () => {
    if (!source) return;
    setBusy(true);setError('');setFinished(null);
    try {
      const parsed = await parseStatementPdf(source, kind);
      setResult(parsed);setRows(parsed.rows);
      if (!parsed.rows.length) setError('Não localizei lançamentos com segurança. PDFs digitalizados ou layouts específicos exigem conferência manual.');
    } catch (reason:any) {
      setResult(null);setRows([]);
      setError(reason?.message || 'Não foi possível ler o documento.');
    } finally {setBusy(false);}
  };
  const revise = (index:number, change:Partial<ParsedStatementRow>) =>
    setRows(current=>current.map((row,i)=>i===index?{...row,...change}:row));

  const save = async () => {
    if (!result || !selectedCount) return;
    setBusy(true);setError('');
    let recorded=0;
    try {
      for(const row of rows.filter(x=>x.selected)) {
        await personalWalletService.recordStatementRow({
          targetKind:kind,targetId,documentHash:result.hash,rowKey:row.rowKey,
          date:row.date,description:row.description,amount:row.amount,category:row.category,
        });
        recorded++;
      }
      await onImported();
      setFinished(recorded);
      setRows(current=>current.map(row=>({...row,selected:false})));
    } catch(reason:any) {
      await onImported().catch(()=>{});
      setError(`${recorded} lançamento(s) processados. ${reason?.message||'Falha no registro.'} Repita a seleção para retomar sem duplicar.`);
    } finally {setBusy(false);}
  };
  return (
    <div role="dialog" aria-modal="true" data-modal-open="true"
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/90 p-2 sm:p-5">
      <section className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText size={22} className="text-cyan-400" />
            <div><h2 className="text-sm font-bold">Importar PDF — {kind==='CARD'?'Cartão':'Conta'}</h2>
              <p className="text-xs text-slate-400">{targetName}</p></div>
          </div>
          <button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={19}/></button>
        </header>
        <div className="space-y-4 overflow-y-auto p-4">
          <p className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 text-xs text-amber-200">
            <AlertTriangle size={15} className="mr-2 inline" />
            O PDF será lido no seu aparelho. Os itens encontrados são apenas uma sugestão e precisam de sua aprovação.
            A importação NÃO debita conta, NÃO cria faturas ou despesas financeiras e NÃO altera o limite do cartão.
            Valores resumidos que já foram lançados não serão duplicados.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-4">
            <UploadCloud className="shrink-0 text-cyan-400" size={24}/>
            <span className="min-w-0 flex-1 truncate text-sm">{source?.name||'Selecionar PDF do banco ou do cartão (até 10 MB)'}</span>
            <input type="file" accept=".pdf,application/pdf" className="sr-only" disabled={busy} onChange={e=>{
              setSource(e.target.files?.[0]||null);setResult(null);setRows([]);setError('');setFinished(null);
            }}/>
          </label>
          <button disabled={!source||busy} onClick={parse} type="button" className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold disabled:opacity-40">
            {busy?'Processando...':'Ler e identificar lançamentos'}
          </button>
          {error && <p role="alert" className="rounded-lg border border-rose-600/50 p-3 text-xs text-rose-300">{error}</p>}
          {finished!==null && <p role="status" className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={17}/> {finished} linha(s) registradas para consulta, sem movimentar saldo.</p>}
          {result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <p>{result.pages} página(s) · {result.rows.length} possível(is) lançamento(s) · {result.skipped} linha(s) ignorada(s)</p>
                <button type="button" className="text-cyan-300 underline" disabled={busy} onClick={()=>setRows(current=>current.map(x=>({...x,selected:x.confidence==='HIGH'})))}>
                  Selecionar apenas os de maior confiança
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((row,i)=>(
                  <div key={row.rowKey} className="grid grid-cols-[auto_1fr] gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={row.selected} disabled={busy} onChange={e=>revise(i,{selected:e.target.checked})} aria-label={`Incluir linha ${i+1}`}/>
                    <div className="grid min-w-0 gap-2 sm:grid-cols-[120px_1fr_130px]">
                      <input type="date" aria-label="Data do lançamento" value={row.date} disabled={busy} onChange={e=>revise(i,{date:e.target.value})} className="min-w-0 rounded bg-slate-800 p-1 text-xs text-white"/>
                      <input aria-label="Descrição do lançamento" value={row.description} disabled={busy} maxLength={240} onChange={e=>revise(i,{description:e.target.value})} className="min-w-0 rounded bg-slate-800 p-1 text-xs text-white"/>
                      <div className="text-right"><strong className={row.amount<0?'text-rose-300':'text-emerald-300'}>{formatMoney(row.amount)}</strong>
                        <p className="text-[10px] text-slate-400">{row.confidence==='REVIEW'?'Conferir valor e sentido':'Valor identificado'}</p>
                      </div>
                      <select disabled={busy} className="min-w-0 rounded bg-slate-800 p-1 text-xs sm:col-span-3" value={row.category} onChange={e=>revise(i,{category:e.target.value})}>
                        {categories.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-700 p-4">
          <span className="text-xs text-slate-400">{selectedCount} selecionado(s)</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs">Fechar</button>
            <button type="button" disabled={busy||!result||selectedCount===0} onClick={save}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold disabled:opacity-40">{busy?'Registrando...':'Confirmar itens selecionados'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
};
