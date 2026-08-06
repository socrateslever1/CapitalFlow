import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, FilePenLine, FileSignature, Loader2, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react';
import { clientLegalDocumentsService, ClientLegalDocument } from '../../../services/clientLegalDocuments.service';

interface ClientLegalDocumentsPanelProps {
  clientId: string;
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const moneyInput = (value: unknown) => Number(value || 0).toFixed(2);
const statusLabel = (doc: ClientLegalDocument) => String(doc.status_assinatura || doc.status || 'PENDENTE').replaceAll('_', ' ');

export const ClientLegalDocumentsPanel: React.FC<ClientLegalDocumentsPanelProps> = ({ clientId, onNotify }) => {
  const [documents, setDocuments] = useState<ClientLegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState<ClientLegalDocument | null>(null);
  const [form, setForm] = useState({ amount: '', dueDate: '', notes: '' });

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onNotify) onNotify(message, type);
  };

  const load = async () => {
    setLoading(true);
    try {
      setDocuments(await clientLegalDocumentsService.list(clientId));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Falha ao carregar documentos jurídicos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [clientId]);

  const openEditor = (doc: ClientLegalDocument) => {
    const snapshot = doc.snapshot_json || doc.snapshot || {};
    const installment = Array.isArray(snapshot.installments) ? snapshot.installments[0] : null;
    setForm({
      amount: moneyInput(snapshot.principalAmount ?? snapshot.amount),
      dueDate: String(installment?.dueDate || '').slice(0, 10),
      notes: String(snapshot.customContent || ''),
    });
    setEditing(doc);
  };

  const save = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      await clientLegalDocumentsService.updatePending(editing.id, {
        amount: Number(form.amount.replace(',', '.')),
        dueDate: form.dueDate,
        notes: form.notes,
      });
      notify('Pré-contrato atualizado.', 'success');
      setEditing(null);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível atualizar.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (doc: ClientLegalDocument) => {
    if (!doc.can_delete) return;
    const confirmed = window.confirm('Excluir este pré-contrato pendente? Esta ação não poderá ser desfeita.');
    if (!confirmed) return;
    setBusyId(doc.id);
    try {
      await clientLegalDocumentsService.removePending(doc.id);
      notify('Pré-contrato excluído.', 'success');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const count = useMemo(() => documents.length, [documents]);

  return (
    <section className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSignature size={16} className="text-indigo-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-200">Documentos jurídicos enviados</p>
            <p className="text-[9px] text-slate-500">{count} documento{count === 1 ? '' : 's'}</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="grid h-8 w-8 place-items-center rounded-md border border-slate-800 text-slate-400 hover:bg-slate-800" aria-label="Atualizar documentos">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {loading ? (
        <div className="grid min-h-20 place-items-center"><Loader2 className="animate-spin text-indigo-400" size={20}/></div>
      ) : documents.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 p-4 text-center text-[10px] text-slate-500">Nenhum documento jurídico enviado.</div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const snapshot = doc.snapshot_json || doc.snapshot || {};
            const portalUrl = doc.portal_url || '';
            const type = String(doc.tipo_documento || doc.tipo || 'DOCUMENTO').replaceAll('_', ' ');
            return (
              <article key={doc.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black uppercase text-white">{type}</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">Enviado em {new Date(doc.created_at).toLocaleString('pt-BR')}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase text-indigo-300">{statusLabel(doc)}</p>
                    {Number(snapshot.principalAmount || snapshot.amount || 0) > 0 && (
                      <p className="mt-1 text-xs font-black text-emerald-400">R$ {Number(snapshot.principalAmount || snapshot.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${doc.signature_count > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                    {doc.signature_count > 0 ? `${doc.signature_count} assinatura(s)` : 'Sem assinatura'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" disabled={!portalUrl} onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')} className="flex items-center justify-center gap-1 rounded-md border border-slate-700 px-2 py-2 text-[9px] font-black uppercase text-slate-200 disabled:opacity-40"><ExternalLink size={12}/> Abrir</button>
                  <button type="button" disabled={!portalUrl} onClick={() => { void navigator.clipboard.writeText(portalUrl); notify('Link do portal copiado.', 'success'); }} className="flex items-center justify-center gap-1 rounded-md border border-slate-700 px-2 py-2 text-[9px] font-black uppercase text-slate-200 disabled:opacity-40"><Copy size={12}/> Copiar link</button>
                  <button type="button" disabled={!doc.can_edit || busyId === doc.id} onClick={() => openEditor(doc)} className="flex items-center justify-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-2 text-[9px] font-black uppercase text-indigo-300 disabled:opacity-40"><Settings2 size={12}/> Configurar</button>
                  <button type="button" disabled={!doc.can_delete || busyId === doc.id} onClick={() => void remove(doc)} className="flex items-center justify-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-[9px] font-black uppercase text-rose-300 disabled:opacity-40">{busyId === doc.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>} Excluir</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[220] grid place-items-center bg-slate-950/90 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><FilePenLine size={17} className="text-indigo-400"/><h3 className="text-sm font-black uppercase text-white">Editar pré-contrato</h3></div>
              <button type="button" onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800"><X size={16}/></button>
            </div>
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-[9px] font-black uppercase text-slate-500">Capital previsto</span><input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"/></label>
              <label className="block"><span className="mb-1 block text-[9px] font-black uppercase text-slate-500">Vencimento</span><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"/></label>
              <label className="block"><span className="mb-1 block text-[9px] font-black uppercase text-slate-500">Observações</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"/></label>
              <p className="text-[9px] leading-relaxed text-amber-300">Ao salvar, o documento pendente recebe novo conteúdo e novo hash. Documentos com assinatura não podem ser editados.</p>
              <button type="button" disabled={busyId === editing.id} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">{busyId === editing.id ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar configuração</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
