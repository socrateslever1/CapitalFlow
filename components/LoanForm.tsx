
import React from 'react';
import { Modal } from './ui/Modal';
import { Loan, Client, CapitalSource, UserProfile } from '../types';
import { X, Camera, History } from 'lucide-react';
import { formatBRDate } from '../utils/dateHelpers';
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
  const formId = React.useId();
  const {
    formData, setFormData,
    fixedDuration, setFixedDuration,
    skipWeekends, setSkipWeekends,
    isSubmitting, isUploading,
    attachments, customDocuments,
    showCamera, videoRef, fileInputRef,
    manualFirstDueDate, setManualFirstDueDate, isDailyModality,
    startCamera, takePhoto, stopCamera,
    handleClientSelect, handlePickContact,
    handleFileUpload, toggleDocVisibility, removeDoc,
    handleSubmit
  } = useLoanForm(props);

  return (
    <>
      <Modal onClose={() => { if (showCamera.active) stopCamera(); props.onCancel(); }}
        title={props.initialData ? 'Ajustar Contrato' : 'Novo Contrato'} subtitle="Configuração de Empréstimo"
        icon={<History size={22} />} size="xl" busy={isSubmitting || isUploading}
        footer={<LoanFormActions formId={formId} isSubmitting={isSubmitting || isUploading} isEditing={!!props.initialData} />}>
            {props.initialData && (
                <div className="mb-8 bg-blue-600/5 p-4 rounded-lg border border-blue-500/10 flex items-center gap-4">
                    <div className="p-2.5 bg-blue-600/10 rounded-lg text-blue-400"><History size={18}/></div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-blue-500/70 tracking-widest">Auditoria do Registro</p>
                        <p className="text-xs text-slate-300 font-bold">Iniciado em: {formatBRDate(props.initialData.createdAt || props.initialData.startDate)}</p>
                        <p className="text-[9px] text-slate-500 font-bold mt-1">Principal original e parcelas já liquidadas são preservados. Alterações de saldo/parcelas remanescentes devem ser feitas no editor do acordo.</p>
                    </div>
                </div>
            )}

            <form id={formId} onSubmit={handleSubmit} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                    <LoanFormClientSection
                        clients={props.clients}
                        formData={formData}
                        setFormData={setFormData}
                        handleClientSelect={handleClientSelect}
                        handlePickContact={handlePickContact}
                    />
                </div>

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
                        isEditing={!!props.initialData}
                    />
                </div>

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

            </form>
      </Modal>
      {showCamera.active && (
        <Modal onClose={stopCamera} title="Modo captura" icon={<Camera size={22} />} size="lg">
          <div className="mb-6 text-white text-[10px] font-black uppercase tracking-[0.3em] bg-blue-600 px-6 py-2 rounded-lg">MODO CAPTURA</div>
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl h-auto border-4 border-slate-900 rounded-lg shadow-2xl shadow-blue-900/20" />
          <div className="mt-8 sm:mt-12 flex gap-10">
            <button onClick={stopCamera} className="p-6 bg-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-rose-600 transition-all shadow-xl"><X size={28}/></button>
            <button onClick={takePhoto} className="p-10 bg-white rounded-lg text-black shadow-2xl shadow-white/10 active:scale-90 transition-transform"><Camera size={36}/></button>
          </div>
        </Modal>
      )}
    </>
  );
};
