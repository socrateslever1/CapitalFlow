import React, { useState, useRef } from "react";
import PixDepositModal from "../components/modals/PixDepositModal";
import { CapitalSource, Loan } from "../types";
import { Plus, ChevronLeft, Wallet, Upload, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { SourceCard } from '../components/cards/SourceCard';
import { filesService } from '../services/files.service';

interface SourcesPageProps {
  sources: CapitalSource[];
  loans: Loan[];

  openConfirmation: (config: any) => void;
  handleUpdateSourceBalance: () => void;

  isStealthMode?: boolean;
  ui: any;

  // ✅ NOVO: abre o modal PIX (fica no Container)
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
  goBack,
  activeUser
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ "Adicionar saldo" agora chama PIX
  const handleAddFunds = (source: CapitalSource) => {
    onOpenPixDeposit(source);
  };

  const handleEditSource = (source: CapitalSource) => {
    ui.setEditingSource(source);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser || !ui.editingSource) return;

    // Use filesService.uploadFile
    const path = `${activeUser.id}/source_logos/${Date.now()}_${file.name}`;
    const url = await filesService.uploadFile(file, path);

    if (url) {
      ui.setEditingSource({
        ...ui.editingSource,
        logo_url: url
      });
    }
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
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 shrink-0"
        >
          <Plus size={16} /> Nova Fonte
        </button>
      </div>

      {/* GRID RESPONSIVA AJUSTADA: sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 */}
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

      {/* Modal de Edição Manual de Saldo (Inventário) */}
      {ui.editingSource && (
        <Modal
          onClose={() => ui.setEditingSource(null)}
          title={`Ajuste Manual: ${ui.editingSource.name}`}
        >
          <div className="space-y-4">
            <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl">
              <p className="text-[10px] text-amber-200 uppercase font-bold text-center">
                Atenção: Use apenas para correção de inventário. Para entradas/saídas, use as funções do sistema.
              </p>
            </div>

            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">
              Novo Saldo Atual
            </label>

            <input
              type="number"
              value={ui.editingSource.balance}
              onChange={e =>
                ui.setEditingSource({
                  ...ui.editingSource,
                  balance: parseFloat(e.target.value) || 0
                })
              }
              className="w-full bg-slate-950 p-4 rounded-xl text-white text-xl font-bold outline-none border border-slate-800 focus:border-blue-500 transition-colors"
            />

            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">
              Imagem da Carteira (Logo)
            </label>

            <div className="flex items-center gap-4">
              {ui.editingSource.logo_url ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-700 group">
                  <img src={ui.editingSource.logo_url} alt="Logo" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => ui.setEditingSource({ ...ui.editingSource, logo_url: '' })}
                    className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="text-xs text-white font-bold">Remover</span>
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 border-dashed">
                  <ImageIcon size={24} className="text-slate-500" />
                </div>
              )}

              <div className="flex-1">
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   className="hidden" 
                   accept="image/*"
                   onChange={handleFileChange}
                 />
                 <button
                   onClick={() => fileInputRef.current?.click()}
                   className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase rounded-lg border border-slate-700 flex items-center gap-2 transition-colors"
                 >
                   <Upload size={14} />
                   Carregar Imagem
                 </button>
                 <p className="text-[10px] text-slate-500 mt-1">JPG, PNG ou GIF (Max 2MB)</p>
              </div>
            </div>

            <button
              onClick={handleUpdateSourceBalance}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl uppercase transition-all shadow-lg mt-4"
            >
              Salvar Correção
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};