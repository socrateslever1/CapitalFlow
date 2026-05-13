
import React from 'react';
import { Loan, Client, CapitalSource, UserProfile } from '../types';
import { X, Camera, History } from 'lucide-react';
import { useLoanForm } from '../features/loans/hooks/useLoanForm';
import { LoanFormClientSection } from './forms/LoanFormClientSection';
import { LoanFormFinancialSection } from './forms/LoanFormFinancialSection';
import { LoanFormDocumentsSection } from './forms/LoanFormDocumentsSection';
import { LoanFormActions } from './forms/LoanFormActions';

interface LoanFormProps {
  onAdd: (loan: Loan) => void;
  onCancel: () => void;
  initialData?: Loan | null;
  clients: Client[];
  sources: CapitalSource[];
  userProfile?: UserProfile | null;
}

export const LoanForm: React.FC<LoanFormProps> = (props) => {
  const {
    formData, setFormData,
    fixedDuration, setFixedDuration,
    skipWeekends, setSkipWeekends,
    isSubmitting, isUploading,
    attachments, customDocuments,
    showCamera, videoRef, fileInputRef,
    // Fix: Replaced autoDueDate with manualFirstDueDate and added setManualFirstDueDate to match useLoanForm return type
    manualFirstDueDate, setManualFirstDueDate, isDailyModality,
    startCamera, takePhoto, stopCamera,
    handleClientSelect, handlePickContact,
    handleFileUpload, toggleDocVisibility, removeDoc,
    handleSubmit
  } = useLoanForm(props);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900/90 border border-slate-800/50 rounded-[2.5rem] w-full max-w-5xl p-6 sm:p-10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative flex flex-col max-h-[90dvh] overflow-hidden backdrop-blur-md">
        <div className="flex justify-between items-center mb-8 flex-shrink-0">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <History size={24} />
                </div>
                <div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase leading-none">
                      {props.initialData ? 'Ajustar Contrato' : 'Novo Contrato'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Configuração de Empréstimo</p>
                </div>
            </div>
            <button onClick={() => { if(showCamera.active) stopCamera(); props.onCancel(); }} className="p-2 sm:p-3 bg-slate-800/50 text-slate-500 hover:text-white rounded-2xl transition-all hover:bg-slate-800 border border-slate-800/50">
              <X size={20}/>
            </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
            {props.initialData && (
                <div className="mb-8 bg-blue-600/5 p-4 rounded-2xl border border-blue-500/10 flex items-center gap-4">
                    <div className="p-2.5 bg-blue-600/10 rounded-xl text-blue-400"><History size={18}/></div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-blue-500/70 tracking-widest">Auditoria do Registro</p>
                        <p className="text-xs text-slate-300 font-bold">Iniciado em: {new Date(props.initialData.createdAt || props.initialData.startDate).toLocaleString('pt-BR')}</p>
                    </div>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                
                {/* COLUNA 1: CLIENTE */}
                <div className="space-y-6">
                    <LoanFormClientSection 
                        clients={props.clients}
                        formData={formData}
                        setFormData={setFormData}
                        handleClientSelect={handleClientSelect}
                        handlePickContact={handlePickContact}
                    />
                </div>

                {/* COLUNA 2: FINANCEIRO */}
                <div className="space-y-6">
                    <LoanFormFinancialSection 
                        sources={props.sources}
                        formData={formData}
                        setFormData={setFormData}
                        isDailyModality={isDailyModality}
                        fixedDuration={fixedDuration}
                        setFixedDuration={setFixedDuration}
                        manualFirstDueDate={manualFirstDueDate}
                        setManualFirstDueDate={setManualFirstDueDate}
                        skipWeekends={skipWeekends}
                        setSkipWeekends={setSkipWeekends}
                    />
                </div>

                {/* COLUNA 3: GARANTIAS & DOCUMENTOS */}
                <div className="space-y-6">
                    <LoanFormDocumentsSection 
                        formData={formData}
                        setFormData={setFormData}
                        attachments={attachments}
                        customDocuments={customDocuments}
                        startCamera={startCamera}
                        fileInputRef={fileInputRef}
                        isUploading={isUploading}
                        handleFileUpload={handleFileUpload}
                        toggleDocVisibility={toggleDocVisibility}
                        removeDoc={removeDoc}
                    />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800/50">
                  <LoanFormActions 
                    isSubmitting={isSubmitting} 
                    isEditing={!!props.initialData} 
                  />
              </div>
            </form>
        </div>
      </div>
      {showCamera.active && (
        <div className="fixed inset-0 z-[110] bg-slate-950 flex flex-col items-center justify-center p-6">
          <div className="mb-6 text-white text-[10px] font-black uppercase tracking-[0.3em] bg-blue-600 px-6 py-2 rounded-xl">MODO CAPTURA</div>
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl h-auto border-4 border-slate-900 rounded-2xl shadow-2xl shadow-blue-900/20" />
          <div className="mt-8 sm:mt-12 flex gap-10">
            <button onClick={stopCamera} className="p-6 bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-rose-600 transition-all shadow-xl"><X size={28}/></button>
            <button onClick={takePhoto} className="p-10 bg-white rounded-xl text-black shadow-2xl shadow-white/10 active:scale-90 transition-transform"><Camera size={36}/></button>
          </div>
        </div>
      )}
    </div>
  );
};
