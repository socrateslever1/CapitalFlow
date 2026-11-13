import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  DollarSign,
  Smartphone,
  HardDriveDownload,
  Filter,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import type { Loan, CapitalSource } from '../../../types';
import { exportLoansToExcel, exportLoansToCSV } from '../../../utils/loanExport';
import { resolveLoanVisualClassification } from '../../../utils/loanFilterResolver';
import { formatMoney } from '../../../utils/formatters';
import { usePWAInstall } from '../../../hooks/usePWAInstall';

interface ProfileExportReportsProps {
  loans: Loan[];
  sources: CapitalSource[];
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onExportBackup?: () => void;
}

type FilterScope = 'TODOS' | 'ATRASADOS' | 'EM_DIA' | 'QUITADO' | 'RENEGOCIADO';

export const ProfileExportReports: React.FC<ProfileExportReportsProps> = ({
  loans,
  sources,
  showToast,
  onExportBackup,
}) => {
  const [selectedScope, setSelectedScope] = useState<FilterScope>('TODOS');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Filtrar contratos com base no escopo selecionado
  const filteredLoans = loans.filter((loan) => {
    if (selectedScope === 'TODOS') return true;
    const classification = resolveLoanVisualClassification(loan);
    if (selectedScope === 'ATRASADOS') {
      return classification === 'ATRASADO' || classification === 'CRITICO';
    }
    return classification === selectedScope;
  });

  // Métricas do lote selecionado
  const totalPrincipal = filteredLoans.reduce((acc, l) => acc + Number(l.principal || 0), 0);
  const totalToReceive = filteredLoans.reduce((acc, l) => acc + Number(l.totalToReceive || 0), 0);

  const handleExport = async (format: 'EXCEL' | 'CSV') => {
    if (filteredLoans.length === 0) {
      showToast('Nenhum contrato encontrado para os filtros selecionados.', 'info');
      return;
    }

    const scopeLabel =
      selectedScope === 'TODOS'
        ? 'Todos os Contratos'
        : selectedScope === 'ATRASADOS'
        ? 'Contratos em Atraso'
        : selectedScope === 'EM_DIA'
        ? 'Contratos em Dia'
        : selectedScope === 'QUITADO'
        ? 'Contratos Quitados'
        : 'Contratos Renegociados';

    if (format === 'EXCEL') {
      setIsExportingExcel(true);
      try {
        await exportLoansToExcel(filteredLoans, sources, scopeLabel);
        showToast(`Relatório Excel (.xlsx) exportado com sucesso! (${filteredLoans.length} contratos)`, 'success');
      } catch (err: any) {
        showToast(`Erro ao exportar Excel: ${err?.message || 'Falha na geração'}`, 'error');
      } finally {
        setIsExportingExcel(false);
      }
    } else {
      setIsExportingCSV(true);
      try {
        exportLoansToCSV(filteredLoans, sources, scopeLabel);
        showToast(`Arquivo CSV (.csv) exportado com sucesso! (${filteredLoans.length} contratos)`, 'success');
      } catch (err: any) {
        showToast(`Erro ao exportar CSV: ${err?.message || 'Falha na geração'}`, 'error');
      } finally {
        setIsExportingCSV(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DA SEÇÃO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
            <Download size={20} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex flex-wrap items-center gap-2">
              Exportar Relatórios &amp; Downloads
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Excel • CSV
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Gere planilhas filtradas, arquivos de dados ou baixe o aplicativo no seu dispositivo.
            </p>
          </div>
        </div>

        {/* Resumo do Banco */}
        <div className="flex items-center gap-3 bg-slate-950 px-3.5 py-2.5 rounded-xl border border-slate-800/80 shrink-0">
          <div className="sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Base Ativa</p>
            <p className="text-sm font-bold text-white tabular-nums">{loans.length} {loans.length === 1 ? 'Contrato' : 'Contratos'}</p>
          </div>
        </div>
      </div>

      {/* SELETOR DE ESCOPO / FILTRO */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Filter size={13} className="text-emerald-400" /> Filtrar contratos para o relatório
          </label>
          <span className="text-xs font-semibold text-slate-400 tabular-nums">
            {filteredLoans.length} selecionado(s)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { id: 'TODOS', label: 'Todos', count: loans.length, color: 'border-slate-700 text-slate-200' },
            {
              id: 'ATRASADOS',
              label: 'Atrasados',
              count: loans.filter((l) => {
                const c = resolveLoanVisualClassification(l);
                return c === 'ATRASADO' || c === 'CRITICO';
              }).length,
              color: 'border-amber-500/30 text-amber-400',
            },
            {
              id: 'EM_DIA',
              label: 'Em Dia',
              count: loans.filter((l) => resolveLoanVisualClassification(l) === 'EM_DIA').length,
              color: 'border-emerald-500/30 text-emerald-400',
            },
            {
              id: 'RENEGOCIADO',
              label: 'Renegociados',
              count: loans.filter((l) => resolveLoanVisualClassification(l) === 'RENEGOCIADO').length,
              color: 'border-purple-500/30 text-purple-400',
            },
            {
              id: 'QUITADO',
              label: 'Quitados',
              count: loans.filter((l) => resolveLoanVisualClassification(l) === 'QUITADO').length,
              color: 'border-blue-500/30 text-blue-400',
            },
          ].map((scope) => {
            const isSelected = selectedScope === scope.id;
            return (
              <button
                key={scope.id}
                type="button"
                onClick={() => setSelectedScope(scope.id as FilterScope)}
                className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-950/40 border-emerald-500 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide">{scope.label}</span>
                <span className="text-lg font-bold tabular-nums mt-0.5 text-white">{scope.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CARDS DE RESUMO DO LOTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <DollarSign size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Capital Concedido no Lote</p>
            <p className="text-base font-bold tabular-nums text-white">{formatMoney(totalPrincipal)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400">Previsão Bruta a Receber</p>
            <p className="text-base font-bold tabular-nums text-emerald-400">{formatMoney(totalToReceive)}</p>
          </div>
        </div>
      </div>

      {/* PRINCIPAIS BOTÕES DE EXPORTAÇÃO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BOTÃO EXCEL */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-950/25 via-slate-900 to-slate-950 border border-emerald-500/30 flex flex-col justify-between gap-4 hover:border-emerald-500/60 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                <FileSpreadsheet size={20} />
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Mais Recomendado
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              Planilha Excel Formatada (.xlsx)
            </h4>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Exporta todos os contratos com formatação de moeda R$, cabeçalhos coloridos, status, datas de vencimento, dias de atraso e fórmulas de soma.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleExport('EXCEL')}
            disabled={isExportingExcel || filteredLoans.length === 0}
            className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isExportingExcel ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Gerando Planilha...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Baixar Planilha Excel ({filteredLoans.length})</span>
              </>
            )}
          </button>
        </div>

        {/* BOTÃO CSV */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-blue-950/25 via-slate-900 to-slate-950 border border-blue-500/30 flex flex-col justify-between gap-4 hover:border-blue-500/60 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                <FileText size={20} />
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Padrão Universal
              </span>
            </div>
            <h4 className="text-sm font-bold text-white">
              Arquivo de Dados CSV (.csv)
            </h4>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Arquivo texto com codificação UTF-8 BOM e separador ponto-e-vírgula (;), ideal para Google Sheets, Power BI, Python ou ERPs.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleExport('CSV')}
            disabled={isExportingCSV || filteredLoans.length === 0}
            className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isExportingCSV ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Gerando Arquivo...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Baixar Arquivo CSV ({filteredLoans.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* OUTRAS OPÇÕES DE DOWNLOAD / INSTALAÇÃO */}
      <div className="pt-5 border-t border-slate-800/80 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <HardDriveDownload size={14} className="text-blue-400" /> Outras Opções de Download e Backup
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* BACKUP DO SISTEMA */}
          {onExportBackup && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-white">Snapshot do Banco (JSON)</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cópia integral com todos os cadastros e contratos para restauração.
                </p>
              </div>
              <button
                type="button"
                onClick={onExportBackup}
                className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Download size={14} className="text-blue-400" /> Backup JSON
              </button>
            </div>
          )}

          {/* INSTALAÇÃO DO APP / PWA */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Smartphone size={14} className="text-emerald-400" />
                Baixar Aplicativo no Celular / PC
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Instale o CapitalFlow como aplicativo com tela cheia e acesso rápido.
              </p>
            </div>

            {isInstalled ? (
              <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shrink-0 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Instalado
              </span>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Download size={14} /> Instalar
              </button>
            ) : isIOS ? (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Share2 size={14} className="text-blue-400" /> Como Instalar (iOS)
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-400 shrink-0">
                Navegador Pronto
              </span>
            )}
          </div>
        </div>
      </div>

      {/* MODAL GUIA IOS */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
              <Smartphone size={18} className="text-emerald-400" /> Instalar no iPhone / iPad
            </h3>
            <div className="mt-4 space-y-3 text-xs text-slate-300 leading-relaxed">
              <p className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Abra este site no <strong>Safari</strong> do seu iPhone ou iPad.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Toque no botão de <strong>Compartilhar</strong> (ícone de quadrado com seta para cima na barra inferior).</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
