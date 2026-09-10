import { useEffect, useRef, useState } from 'react';
import { Loan, Client, CapitalSource, UserProfile, LoanDocument } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { generateUUID } from '../../../utils/generators';
import { maskDocument, maskPhone, normalizeBrazilianPhone } from '../../../utils/formatters';
import { safeFileFirst } from '../utils/formHelpers';
import { toStorageReference } from '../../../utils/storageUrl';
import { isTestSource } from '../../../utils/testSource';
import { validateLoanForm } from '../domain/loanForm.validators';
import { mapFormToLoan } from '../domain/loanForm.mapper';
import { addMonthsUTC, toISODateOnlyUTC } from '../../../utils/dateHelpers';

interface UseLoanFormProps {
  onAdd: (loan: Loan) => void;
  onCancel: () => void;
  initialData?: Loan | null;
  clients: Client[];
  sources: CapitalSource[];
  userProfile?: UserProfile | null;
}

export const useLoanForm = ({ onAdd, initialData, clients, sources, userProfile }: UseLoanFormProps) => {
  const [formData, setFormData] = useState<any>({});
  const [fixedDuration, setFixedDuration] = useState('30');
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [documentPhotos, setDocumentPhotos] = useState<string[]>([]);
  const [customDocuments, setCustomDocuments] = useState<LoanDocument[]>([]);
  const [showCamera, setShowCamera] = useState<{ active: boolean; type: 'guarantee' | 'document' }>({ active: false, type: 'guarantee' });
  const [manualFirstDueDate, setManualFirstDueDate] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        clientId: initialData.clientId || '',
        debtorName: initialData.debtorName || '',
        debtorPhone: initialData.debtorPhone || '',
        debtorDocument: initialData.debtorDocument || '',
        debtorAddress: initialData.debtorAddress || '',
        sourceId: initialData.sourceId || '',
        principal: String(initialData.principal ?? ''),
        interestRate: String(initialData.interestRate ?? ''),
        finePercent: String(initialData.finePercent ?? ''),
        dailyInterestPercent: String(initialData.dailyInterestPercent ?? ''),
        startDate: String(initialData.startDate || '').slice(0, 10),
        billingCycle: initialData.billingCycle || 'MONTHLY',
        fundingTotalPayable: String((initialData as any).fundingTotalPayable ?? ''),
        fundingInstallmentsCount: String((initialData as any).fundingInstallmentsCount ?? ''),
        fundingMonthlyRate: String((initialData as any).fundingMonthlyRate ?? ''),
        customerMarginPercent: String((initialData as any).customerMarginPercent ?? ''),
        fundingCalculationMode: (initialData as any).fundingCalculationMode || 'TOTAL',
        fundingOperatorAbsorbsInterest: (initialData as any).fundingOperatorAbsorbsInterest === true,
        fundingFeePercent: String((initialData as any).fundingFeePercent ?? ''),
        fundingProvider: String((initialData as any).fundingProvider ?? ''),
      });
      setSkipWeekends(!!initialData.skipWeekends);
      setAttachments(Array.isArray((initialData as any).attachments) ? (initialData as any).attachments : []);
      setCustomDocuments(Array.isArray((initialData as any).documents) ? (initialData as any).documents : []);
      const firstDue = initialData.installments?.[0]?.dueDate;
      setManualFirstDueDate(firstDue ? String(firstDue).slice(0, 10) : String(initialData.startDate || '').slice(0, 10));
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setFormData({
        clientId: '', debtorName: '', debtorPhone: '', debtorDocument: '', debtorAddress: '',
        sourceId: sources[0]?.id || '', principal: '', interestRate: '', finePercent: '2', dailyInterestPercent: '1',
        startDate: today, billingCycle: 'MONTHLY', fundingTotalPayable: '', fundingInstallmentsCount: '10',
        fundingMonthlyRate: '', customerMarginPercent: '30', fundingCalculationMode: 'TOTAL', fundingOperatorAbsorbsInterest: false,
        fundingFeePercent: '', fundingProvider: ''
      });
      setManualFirstDueDate(today);
    }
  }, [initialData, sources]);

  const isDailyModality = ['DAILY_FREE', 'DAILY_FIXED_TERM'].includes(formData.billingCycle);

  useEffect(() => {
      return () => {
          customDocuments.forEach(doc => {
              if (doc.url.startsWith('blob:')) URL.revokeObjectURL(doc.url);
          });
      };
  }, [customDocuments]);

  useEffect(() => {
      return () => {
          if (videoRef.current && videoRef.current.srcObject) {
              const stream = videoRef.current.srcObject as MediaStream;
              stream.getTracks().forEach(t => t.stop());
          }
      };
  }, []);

  const handleClientSelect = (id: string) => {
    if (!id) { setFormData({ ...formData, clientId: '' }); return; }
    const client = clients.find(c => c.id === id);
    if (client) {
      setFormData({
        ...formData,
        clientId: client.id,
        debtorName: client.name,
        debtorPhone: maskPhone(client.phone),
        debtorDocument: maskDocument(client.document),
        debtorAddress: client.address || ''
      });
    }
  };

  const startCamera = async (type: 'guarantee' | 'document') => {
    setShowCamera({ active: true, type });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      console.error("Camera Error:", err);
      let errorMsg = "Erro ao acessar a câmera.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') errorMsg = "Permissão da câmera negada.";
      else if (err.name === 'NotFoundError') errorMsg = "Nenhuma câmera encontrada.";
      alert(errorMsg);
      setShowCamera({ active: false, type });
    }
  };

  const takePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const photo = canvas.toDataURL('image/jpeg');
      if (showCamera.type === 'guarantee') setAttachments([...attachments, photo]);
      else setDocumentPhotos([...documentPhotos, photo]);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setShowCamera({ ...showCamera, active: false });
  };

  const handlePickContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const contacts = await (navigator as any).contacts.select(props, opts);
        if (contacts.length) {
          const contact = contacts[0];
          const name = contact.name && contact.name.length > 0 ? contact.name[0] : '';
          const number = contact.tel && contact.tel.length > 0 ? contact.tel[0] : '';
          const normalizedPhone = normalizeBrazilianPhone(number);
          setFormData((prev: any) => ({ ...prev, debtorName: name || prev.debtorName, debtorPhone: normalizedPhone }));
        }
      } catch (ex) {}
    } else { alert("Importação de contatos disponível apenas em dispositivos Android via Chrome."); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = safeFileFirst(e.target.files);
      if (file) {
          const fileType = file.type?.includes('pdf') ? 'PDF' : 'IMAGE';
          setIsUploading(true);
          try {
              let publicUrl = '';
              if (userProfile?.id === 'DEMO') {
                  publicUrl = URL.createObjectURL(file);
              } else {
                  const ext = file.name.split('.').pop() || 'bin';
                  const path = `${userProfile?.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
                  const { error: uploadError } = await supabase.storage.from('documentos').upload(path, file);
                  if (uploadError) throw uploadError;
                  publicUrl = toStorageReference('documentos', path);
              }
              const newDoc: LoanDocument = { id: generateUUID(), url: publicUrl, name: file.name, type: fileType as any, visibleToClient: false, uploadedAt: new Date().toISOString() };
              setCustomDocuments([...customDocuments, newDoc]);
          } catch (err: any) { alert("Erro ao enviar arquivo: " + err.message); } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
      }
  };

  const toggleDocVisibility = (docId: string) => setCustomDocuments(docs => docs.map(d => d.id === docId ? { ...d, visibleToClient: !d.visibleToClient } : d));

  const removeDoc = (docId: string) => {
      if(confirm('Remover este documento?')) {
          const target = customDocuments.find(d => d.id === docId);
          if (target && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
          setCustomDocuments(docs => docs.filter(d => d.id !== docId));
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { isValid, error } = validateLoanForm(formData, sources, !!initialData);

    if (!isValid) {
        alert(error);
        return;
    }

    if (formData.sourceId && !initialData) {
        const selectedSource = sources.find(s => s.id === formData.sourceId);
        if (selectedSource && !isTestSource(selectedSource) && parseFloat(formData.principal) > selectedSource.balance) {
            const diff = parseFloat(formData.principal) - selectedSource.balance;
            if(!window.confirm(`AVISO CONTÁBIL:\n\nO valor do empréstimo (R$ ${parseFloat(formData.principal).toLocaleString()}) é maior que o saldo na carteira ${selectedSource.name} (R$ ${selectedSource.balance.toLocaleString()}).\n\nIsso deixará a carteira NEGATIVA em R$ -${diff.toLocaleString()}.\n\nDeseja confirmar esta saída de caixa?`)) return;
        }
    }

    setIsSubmitting(true);
    try {
        const loanPayload = mapFormToLoan(
            formData,
            fixedDuration,
            initialData || null,
            attachments,
            documentPhotos,
            customDocuments,
            userProfile?.id || '',
            manualFirstDueDate
        );
        loanPayload.skipWeekends = skipWeekends;

        const hasActiveAgreement = !!initialData && ['EM_ACORDO', 'IN_AGREEMENT'].includes(String(initialData.status || '').toUpperCase());

        if (hasActiveAgreement && initialData) {
            loanPayload.principal = initialData.principal;
            loanPayload.billingCycle = initialData.billingCycle;
            loanPayload.startDate = initialData.startDate;
            loanPayload.totalToReceive = initialData.totalToReceive;
            loanPayload.installments = [];
        } else if (loanPayload.installments?.length && manualFirstDueDate) {
            if (formData.billingCycle === 'INSTALLMENT_FIXED') {
                loanPayload.installments = loanPayload.installments.map((inst, index) => ({
                    ...inst,
                    dueDate: toISODateOnlyUTC(addMonthsUTC(manualFirstDueDate, index)),
                }));
            } else {
                loanPayload.installments[0].dueDate = manualFirstDueDate;
            }
        }

        await onAdd(loanPayload);
    } catch (err: any) {
        console.error("Erro interno no formulário:", err);
        alert("Ocorreu um erro ao processar o contrato. Verifique o console.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return {
    formData, setFormData,
    fixedDuration, setFixedDuration,
    skipWeekends, setSkipWeekends,
    isSubmitting, isUploading,
    attachments, documentPhotos, customDocuments,
    showCamera, videoRef, fileInputRef,
    manualFirstDueDate, setManualFirstDueDate,
    isDailyModality,
    startCamera, takePhoto, stopCamera,
    handleClientSelect, handlePickContact,
    handleFileUpload, toggleDocVisibility, removeDoc,
    handleSubmit
  };
};
