import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Pencil, Trash2, UserPlus, Users, X } from 'lucide-react';
import { LegalWitness } from '../../../types';
import { maskDocument } from '../../../utils/formatters';
import { witnessService } from '../services/witness.service';

interface WitnessBaseManagerProps {
  profileId: string;
  onRefresh?: () => void;
}

const EMPTY_WITNESS = { name: '', document: '' };

export const WitnessBaseManager: React.FC<WitnessBaseManagerProps> = ({ profileId, onRefresh }) => {
  const [witnesses, setWitnesses] = useState<LegalWitness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newWitness, setNewWitness] = useState(EMPTY_WITNESS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWitness, setEditingWitness] = useState(EMPTY_WITNESS);
  const [error, setError] = useState<string | null>(null);

  const loadWitnesses = async () => {
    if (!profileId) return;
    setIsLoading(true);
    setError(null);
    try {
      setWitnesses(await witnessService.list(profileId));
    } catch (e: any) {
      setError(e.message || 'Não foi possível conectar ao banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWitnesses();
  }, [profileId]);

  const persist = async (witness: LegalWitness) => {
    if (!witness.name.trim() || !witness.document.trim()) {
      setError('Preencha o nome e o CPF da testemunha.');
      return false;
    }

    setIsSaving(true);
    setError(null);
    try {
      await witnessService.save(witness, profileId);
      await loadWitnesses();
      onRefresh?.();
      return true;
    } catch (e: any) {
      setError(e.message || 'Não foi possível salvar a testemunha.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    const saved = await persist(newWitness);
    if (saved) setNewWitness(EMPTY_WITNESS);
  };

  const startEdit = (witness: LegalWitness) => {
    setEditingId(witness.id || null);
    setEditingWitness({ name: witness.name || '', document: witness.document || '' });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingWitness(EMPTY_WITNESS);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const saved = await persist({ id: editingId, ...editingWitness });
    if (saved) cancelEdit();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Remover esta testemunha da base habitual?')) return;
    try {
      await witnessService.delete(id, profileId);
      if (editingId === id) cancelEdit();
      await loadWitnesses();
      onRefresh?.();
    } catch (e: any) {
      setError(e.message || 'Não foi possível excluir a testemunha.');
    }
  };

  return (
    <div className="space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-indigo-500/10 p-2 text-indigo-400"><Users size={20} /></div>
        <div>
          <h3 className="text-sm font-black uppercase leading-none tracking-widest text-white">Base habitual</h3>
          <p className="mt-1 text-[9px] font-bold uppercase text-slate-500">Testemunhas usadas nos documentos jurídicos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 rounded-lg border border-slate-800 bg-slate-950 p-5 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="ml-1 block text-[9px] font-black uppercase text-slate-500">Nome completo</span>
          <input value={newWitness.name} onChange={(e) => setNewWitness({ ...newWitness, name: e.target.value })} className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-white outline-none transition-all focus:border-indigo-500" placeholder="Ex.: João da Silva" />
        </label>
        <label className="space-y-1">
          <span className="ml-1 block text-[9px] font-black uppercase text-slate-500">CPF</span>
          <input value={newWitness.document} onChange={(e) => setNewWitness({ ...newWitness, document: maskDocument(e.target.value) })} className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-white outline-none transition-all focus:border-indigo-500" placeholder="000.000.000-00" />
        </label>
        <button type="button" onClick={() => void handleAdd()} disabled={isSaving || !newWitness.name.trim() || !newWitness.document.trim()} className="flex h-[46px] items-center justify-center gap-2 rounded-lg bg-indigo-600 text-[10px] font-black uppercase text-white shadow-lg shadow-indigo-900/20 transition-all hover:bg-indigo-500 disabled:opacity-50">
          {isSaving && !editingId ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={16} /> Adicionar à base</>}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-4 text-rose-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div><p className="text-[10px] font-black uppercase">Falha na operação</p><p className="text-xs">{error}</p></div>
        </div>
      )}

      <div className="grid max-h-[350px] grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2">
        {isLoading ? (
          <div className="col-span-2 flex flex-col items-center justify-center gap-3 py-12 opacity-50"><Loader2 className="animate-spin text-indigo-500" size={32} /><p className="text-[10px] font-black uppercase tracking-widest text-white">Carregando testemunhas...</p></div>
        ) : witnesses.length === 0 ? (
          <div className="col-span-2 rounded-lg border-2 border-dashed border-slate-800 py-16 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">Nenhuma testemunha cadastrada.</div>
        ) : witnesses.map((witness) => {
          const isEditing = editingId === witness.id;
          return (
            <div key={witness.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4 transition-all hover:border-slate-600">
              {isEditing ? (
                <div className="space-y-3">
                  <input value={editingWitness.name} onChange={(e) => setEditingWitness({ ...editingWitness, name: e.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold uppercase text-white outline-none focus:border-indigo-500" />
                  <input value={editingWitness.document} onChange={(e) => setEditingWitness({ ...editingWitness, document: maskDocument(e.target.value) })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-2 text-[9px] font-black uppercase text-slate-300"><X size={13} /> Cancelar</button>
                    <button type="button" onClick={() => void handleUpdate()} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-[9px] font-black uppercase text-white disabled:opacity-50">{isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-xs font-bold uppercase text-white">{witness.name}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{witness.document}</p></div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => startEdit(witness)} className="rounded-full p-2.5 text-slate-500 transition-all hover:bg-indigo-500/10 hover:text-indigo-400" title="Editar testemunha"><Pencil size={16} /></button>
                    <button type="button" onClick={() => witness.id && void handleDelete(witness.id)} className="rounded-full p-2.5 text-slate-600 transition-all hover:bg-rose-500/10 hover:text-rose-500" title="Excluir da base"><Trash2 size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
