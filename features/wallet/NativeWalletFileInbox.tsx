import React, { useEffect, useMemo, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { useWalletSnapshot } from './hooks/useWalletSnapshot';
import { consumeIncomingWalletFile, hasIncomingWalletFile, suggestWalletDestination,
  type WalletDestination } from './nativeWalletFileInbox';
import type { PersonalWalletAccount, PersonalWalletCard } from '../../services/personalWallet.service';

const FlatStatementReader = React.lazy(() => import('../../components/wallet/FlatSmartStatementReader')
  .then(module => ({ default: module.FlatSmartStatementReader })));

const fileKind = (fileName: string, header: string): 'CARD' | 'ACCOUNT' => {
  if (/<BANKACCTFROM|<STMTRS|<BANKMSGSRSV1/i.test(header)) return 'ACCOUNT';
  if (/<CCACCTFROM|<CCSTMTRS|<CREDITCARDMSGSRSV1/i.test(header)) return 'CARD';
  return /extrato\s+conta|conta\s+corrente/i.test(fileName) ? 'ACCOUNT' : 'CARD';
};

const WalletFileReview: React.FC<{ file: File; onClose: () => void }> = ({ file, onClose }) => {
  const { data, loading, error, refresh } = useWalletSnapshot();
  const [header, setHeader] = useState('');
  const [kind, setKind] = useState<'CARD' | 'ACCOUNT'>('CARD');
  const [selection, setSelection] = useState('');
  const [readerOpen, setReaderOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void file.slice(0, 16_384).text().then(snippet => {
      if (!live) return;
      setHeader(snippet);
      setKind(fileKind(file.name, snippet));
    }).catch(() => {});
    return () => { live = false; };
  }, [file]);
  const suggested = useMemo(() => data
    ? suggestWalletDestination(file.name, header, data.accounts, data.cards) : null,
    [file.name, header, data]);
  useEffect(() => {
    if (!suggested || selection) return;
    setKind(suggested.kind);
    setSelection(suggested.targetId);
  }, [suggested, selection]);
  const accounts = data?.accounts || [];
  const cards = (data?.cards || []).filter(card => card.status !== 'CANCELED');
  const available = kind === 'CARD' ? cards : accounts;
  const selected = available.find(item => item.id === selection);
  const selectedName = selected?.nickname || '';
  return <div role="dialog" aria-modal="true" aria-label="Conferir documento bancário recebido"
    className="fixed inset-0 z-[2200] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-sm sm:p-5">
    <section className="flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 p-4">
        <FileText className="shrink-0 text-blue-300" size={20}/>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Conferir fatura ou extrato</h2>
          <p className="truncate text-xs text-slate-300">{file.name}</p>
        </div>
        <button type="button" aria-label="Fechar importação" onClick={onClose}
          className="flex size-11 items-center justify-center rounded-lg border border-slate-700"><X size={19}/></button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        {loading && <p role="status" className="text-sm text-slate-300">Verificando contas e cartões cadastrados...</p>}
        {error && <p role="alert" className="text-sm text-rose-300">Não foi possível listar seus destinos: {error}
          <button type="button" onClick={() => void refresh()} className="ml-3 underline">Tentar novamente</button>
        </p>}
        {data && !readerOpen && <>
          {suggested && <p className="mb-3 rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3 text-xs text-emerald-200">
            Sugestão automática: {suggested.label}. {suggested.reason}. Confirme o destino antes de registrar valores.
          </p>}
          {!suggested && <p className="mb-3 text-xs leading-relaxed text-amber-200">
            O arquivo não identifica uma conta ou cartão de forma inequívoca. Selecione o destino correto.
          </p>}
          <label className="block text-xs font-medium text-slate-300">Tipo de documento
            <select value={kind} onChange={event => {
              setKind(event.target.value as 'CARD' | 'ACCOUNT'); setSelection('');
            }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white">
              <option value="CARD">Fatura de cartão de crédito</option>
              <option value="ACCOUNT">Extrato de conta bancária</option>
            </select>
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-300">Conta ou cartão de destino
            <select value={selection} onChange={event => setSelection(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white">
              <option value="">Selecione para conferir</option>
              {available.map(item => <option key={item.id} value={item.id}>{item.nickname}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selected} onClick={() => setReaderOpen(true)}
            className="mt-4 min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold disabled:opacity-40">
            Ler documento e conferir lançamentos
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Nenhum valor será lançado sem sua confirmação. Pagamentos e estornos não são tratados como novas compras.
          </p>
        </>}
        {data && readerOpen && selected && <React.Suspense fallback={<p>Preparando leitor...</p>}>
          <FlatStatementReader isFlat key={selected.id} initialFile={file}
            kind={kind} targetId={selected.id} targetName={selectedName}
            onClose={() => setReaderOpen(false)} onImported={async () => {
              await refresh();
              window.dispatchEvent(new Event('capitalflow:wallet-updated'));
            }}/>
        </React.Suspense>}
      </div>
    </section>
  </div>;
};

export const NativeWalletFileInbox: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [readError, setReadError] = useState('');
  useEffect(() => {
    let live = true;
    let inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (!(await hasIncomingWalletFile())) return;
        const document = await consumeIncomingWalletFile();
        if (live) { setFile(document); setReadError(''); }
      } catch (reason) {
        if (live) setReadError(reason instanceof Error ? reason.message : 'Não foi possível abrir a fatura.');
      } finally { inFlight = false; }
    };
    void check();
    window.addEventListener('capitalflow:file-arrived', check);
    window.addEventListener('focus', check);
    return () => { live = false; window.removeEventListener('capitalflow:file-arrived', check);
      window.removeEventListener('focus', check); };
  }, []);
  return <>
    {readError && <div role="alert" className="fixed bottom-28 right-3 z-[2200] max-w-sm rounded-lg bg-rose-950 p-3 text-sm text-white">
      {readError}
      <button className="ml-3 underline" onClick={() => setReadError('')}>Fechar</button>
    </div>}
    {file && <WalletFileReview key={file.name + file.size} file={file} onClose={() => setFile(null)}/>}
  </>;
};
