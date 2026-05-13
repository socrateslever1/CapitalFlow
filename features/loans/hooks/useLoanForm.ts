
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loan, LoanBillingModality, Client, CapitalSource, UserProfile, LoanDocument } from '../../../types';
import { maskPhone, maskDocument, normalizeBrazilianPhone } from '../../../utils/formatters';
import { generateUUID } from '../../../utils/generators';
import { supabase } from '../../../lib/supabase';
import { validateLoanForm } from '../domain/loanForm.validators';
import { mapFormToLoan, LoanFormState } from '../domain/loanForm.mapper';
import { calculateAutoDueDate } from '../domain/loanForm.preview';
import { getInitialFormState } from './loanForm.defaults';
import { safeIsoDateOnly, safeSourceId, safeFileFirst } from '../utils/formHelpers';
import { parseDateOnlyUTC, toISODateOnlyUTC, addDaysUTC } from '../../../utils/dateHelpers';

interface UseLoanFormProps {
  initialData?: Loan | null;
  clients: Client[];
  sources: CapitalSource[];
  userProfile?: UserProfile | null;
  onAdd: (loan: Loan) => void;
  onCancel: () => void;
}

export const useLoanForm = ({ initialData, clients, sources, userProfile, onAdd, onCancel }: UseLoanFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fixedDuration, setFixedDuration] = useState('30');
  const [skipWeekends, setSkipWeekends] = useState(false);
  
  const [formData, setFormData] = useState<LoanFormState>(() => getInitialFormState(safeSourceId(sources)));
  
  // NOVO: Estado para controlar o vencimento da 1ª parcela de forma manual/automática
  const [manualFirstDueDate, setManualFirstDueDate] = useState<string>('');

  const [attachments, setAttachments] = useState<string[]>([]);
  const [documentPhotos, setDocumentPhotos] = useState<string[]>([]);
  const [customDocuments, setCustomDocuments] = useState<LoanDocument[]>([]);
  const [showCamera, setShowCamera] = useState<{ active: boolean, type: 'guarantee' | 'document' }>({ active: false, type: 'guarantee' });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Efeito para sugerir data de vencimento quando a data do contrato ou modalidade muda
  useEffect(() => {
    if (!initialData) {
        const start = parseDateOnlyUTC(formData.startDate);
        let daysToAdd = formData.billingCycle === 'MONTHLY' ? 30 : 1;
        const suggested = toISODateOnlyUTC(addDaysUTC(start, daysToAdd, skipWeekends));
        setManualFirstDueDate(suggested);
    }
  }, [formData.startDate, formData.billingCycle, skipWeekends, initialData]);

  const isDailyModality = formData.billingCycle !== 'MONTHLY';

  // Initialization with Guards
  useEffect(() => {
    if (initialData) {
      setFormData({
        clientId: initialData.clientId || '',
        debtorName: initialData.debtorName || '',
        debtorPhone: maskPhone(initialData.debtorPhone || ''),
        debtorDocument: maskDocument(initialData.debtorDocument || ''),
        debtorAddress: initialData.debtorAddress || '',
        sourceId: initialData.sourceId || safeSourceId(sources),
        preferredPaymentMethod: initialData.preferredPaymentMethod || 'PIX',
        pixKey: initialData.pixKey || '',
        principal: String(initialData.principal || ''),
        interestRate: String(initialData.interestRate || ''),
        finePercent: String(initialData.finePercent || 2),
        dailyInterestPercent: String(initialData.dailyInterestPercent || 1),
        billingCycle: initialData.billingCycle || 'MONTHLY',
        notes: initialData.notes || '',
        guaranteeDescription: initialData.guaranteeDescription || '',
        startDate: safeIsoDateOnly(initialData.startDate),
        fundingTotalPayable: initialData.fundingTotalPayable != null ? String(initialData.fundingTotalPayable) : '',
        fundingProvider: initialData.fundingProvider || '',
        fundingFeePercent: initialData.fundingFeePercent != null ? String(initialData.fundingFeePercent) : ''
      });
      
      // Se estiver editando, carrega o vencimento real da parcela 1
      if (initialData.installments?.[0]) {
          setManualFirstDueDate(safeIsoDateOnly(initialData.installments[0].dueDate));
      }
      
      setFixedDuration('30');
      setSkipWeekends(initialData.skipWeekends || false);
      setAttachments(initialData.attachments || []);
      setDocumentPhotos(initialData.documentPhotos || []);
      setCustomDocuments(initialData.customDocuments || []);
    } else {
        setFormData(prev => ({ 
            ...prev, 
            sourceId: prev.sourceId || safeSourceId(sources),
            pixKey: userProfile?.pixKey || '',
            interestRate: userProfile?.defaultInterestRate ? String(userProfile.defaultInterestRate) : '30',
            finePercent: userProfile?.defaultFinePercent ? String(userProfile.defaultFinePercent) : '2',
            dailyInterestPercent: userProfile?.defaultDailyInterestPercent ? String(userProfile.defaultDailyInterestPercent) : '1',
        }));
    }
  }, [initialData, userProfile, sources]);

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
          let number = contact.tel && contact.tel.length > 0 ? contact.tel[0] : '';
          
          const normalizedPhone = normalizeBrazilianPhone(number);
          setFormData((prev) => ({ ...prev, debtorName: name || prev.debtorName, debtorPhone: normalizedPhone }));
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
                  const { data } = supabase.storage.from('documentos').getPublicUrl(path);
                  publicUrl = data.publicUrl;
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
        if (selectedSource && parseFloat(formData.principal) > selectedSource.balance) {
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
            userProfile?.id || ''
        );
        loanPayload.skipWeekends = skipWeekends;
        
        // CORREÇÃO CRÍTICA: Aplica a data manual na primeira parcela
        if (loanPayload.installments?.[0] && manualFirstDueDate) {
            loanPayload.installments[0].dueDate = manualFirstDueDate;
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
