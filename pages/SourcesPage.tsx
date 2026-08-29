import React, { useEffect, useState, useRef } from "react";
import PixDepositModal from "../components/modals/PixDepositModal";
import { CapitalSource, Loan } from "../types";
import { Plus, Wallet, Upload, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { SourceCard } from '../components/cards/SourceCard';
import { filesService } from '../services/files.service';
import { resolveAuthenticatedStorageUrl } from '../utils/storageUrl';

interface SourcesPageProps {
  sources: CapitalSource[];
  loans: Loan[];
  openConfirmation: (config: any) => void;
  handleUpdateSourceBalance: () => void;
  isStealthMode?: boolean;
  ui: any;
  onOpenPixDeposit: (source: CapitalSource) => void;
  goBack?: () => void;
  activeUser?: any;
}

export const SourcesPage: React.FC<SourcesPageProps> = ({
  sources,
  loans,
  openConfirmation,
  handleUpdateSourceBalance,
  isStealthMode,
  ui,
  onOpenPixDeposit,
  activeUser
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const rawLogo = ui.editingSource?.logo_url as string | undefined;

    if (!rawLogo) {
      setLogoPreviewUrl(null);
      return () => { cancelled = true; };
    }

    resolveAuthenticatedStorageUrl(rawLogo)
      .then((url) => {
        if (!cancelled) setLogoPreviewUrl(url);
      })
      .catch((error) => {
        console.warn('[source-logo] Falha ao resolver preview:', error);
        if (!cancelled) setLogoPreviewUrl(null);
      });

    return () => { cancelled = true; };
  }, [ui.editingSource?.id, ui.editingSource?.logo_url]);

  const handleAddFunds = (source: CapitalSource) => {
    onOpenPixDeposit(source);
  };

  const handleEditSource = (source: CapitalSource) => {
    ui.setEditingSource(source);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser || !ui.editingSource) return;

    if (!file.type.startsWith('image/')) {
      window.alert('Selecione uma imagem válida.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      window.alert('A imagem deve ter no máximo 2 MB.');
      e.target.value = '';
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setLogoPreviewUrl(localPreview);
    setLogoLoading(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${activeUser.id}/source_logos/${ui.editingSource.id}/${Date.now()}_${safeName}`;
      const storageReference = await filesService.uploadFile(file, path);

      if (!storageReference) throw new Error('Falha ao armazenar a imagem.');

      ui.setEditingSource({
        ...ui.editingSource,
        logo_url: storageReference
      });

      const signedPreview = await resolveAuthenticatedStorageUrl(storageReference);
      setLogoPreviewUrl(signedPreview || localPreview);
    } catch (error) {
      console.error('[source-logo] Erro no upload:', error);
      window.alert('Não foi possível carregar a imagem da carteira.');
    } finally {
      setLogoLoading(false);
      URL.revokeObjectURL(localPreview);
      e.target.value = '';
    }
  };

  const removeLogo = () => {
    setLogoPreviewUrl(null);
    ui.setEditingSource({ ...ui.editingSource, logo_url: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-900/20">
              <Wallet size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white uppercase tracking-wider leading-none">Fontes de <span className="text-blue-500">Capital</span></h1>
              <p className="text-sm text-slate-500 font-medium uppercase mt-1 tracking-widest">Gestão de Fundos e Liquidez</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => ui.openModal('SOURCE_FORM')}
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 shrink-0"
        >
          <Plus size={16} /> Nova Fonte
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {sources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            loans={loans}
            onAddFunds={handleAddFunds}
            onEdit={handleEditSource}
            onDelete={(id) => openConfirmation({ type: 'DELETE_SOURCE', target: id })}
            isStealthMode={isStealthMode}
          />
        ))}
      </div>

      {ui.editingSource && (
        <Modal
          onClose={() => ui.setEditingSource(null)}
          title={`Ajuste Manual: ${ui.editingSource.name}`}
        >
          <div className="space-y-4">
            <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-lg">
              <p className="text-[10px] text-amber-200 uppercase font-bold text-center">
                Atenção: Use apenas para correção de inventário. Para entradas/saídas, use as funções do sistema.
              </p>
            </div>

            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Novo Saldo Atual</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={ui.editingSource.balance === 0 ? '' : ui.editingSource.balance}
              onChange={e => ui.setEditingSource({
                ...ui.editingSource,
                balance: e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
              })}
              className="w-full bg-slate-950 p-4 rounded-lg text-white text-xl font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
            />

            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Imagem da Carteira (Logo)</label>
            <div className="flex items-center gap-4">
              {logoPreviewUrl ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden border border-slate-700 group bg-slate-950 shrink-0">
                  <img
                    src={logoPreviewUrl}
                    alt={`Logo ${ui.editingSource.name}`}
                    className="w-full h-full object-cover"
                    onError={() => setLogoPreviewUrl(null)}
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <span className="text-[9px] text-white font-bold uppercase">Remover</span>
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 border-dashed shrink-0">
                  <ImageIcon size={24} className="text-slate-500" />
                </div>
              )}

              <div className="flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  disabled={logoLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold uppercase rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                >
                  <Upload size={14} />
                  {logoLoading ? 'Carregando...' : 'Carregar Imagem'}
                </button>
                <p className="text-[10px] text-slate-500 mt-1">JPG, PNG, GIF ou WEBP (máx. 2 MB)</p>
              </div>
            </div>

            <button
              onClick={handleUpdateSourceBalance}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg uppercase transition-all shadow-lg mt-4"
            >
              Salvar Correção
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};