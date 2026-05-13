
import React from 'react';
import { useModal } from '../../../contexts/ModalContext';
import { Modal } from '../../ui/Modal';
import { CheckSquare, Square, Table, ArrowRight, AlertTriangle, CheckCircle2, Info, Loader2, ChevronDown } from 'lucide-react';
import { FIELD_MAPS } from '../../../features/profile/import/domain/importSchema';
import { CalculatorModal } from '../CalculatorModal';
import { FlowModal } from '../FlowModal';
import { MessageHubModal } from '../MessageHubModal';
import { ReceiptModal } from '../ReceiptModal';
import { AIAssistantModal } from '../AIAssistantModal';
import { NoteWrapper } from '../ModalWrappers';
import { Copy } from 'lucide-react';
import { ResetDataModal, DeleteAccountModal } from '../../../features/profile/components/ProfileDangerModals';
import OperatorSupportChat from '../../../features/support/OperatorSupportChat';

export const SystemModalsWrapper = () => {
    const { activeModal, closeModal, ui, activeUser, fileCtrl, fetchFullData, clients, loanCtrl, sources, aiCtrl, loans, profileCtrl, adminCtrl, showToast } = useModal();
    
    // Proteção contra ui undefined
    if (!ui) return null;

    const handleSystemAction = (type: string, meta: any) => {
        if (type === 'PAYMENT' && meta && ui) {
            ui.setPaymentModal({
                loan: { id: meta.loanId, debtorName: meta.clientName, debtorPhone: meta.clientPhone, sourceId: meta.sourceId },
                inst: { id: meta.installmentId, dueDate: meta.start_time },
                calculations: { total: meta.amount, principal: meta.amount, interest: 0, lateFee: 0 }
            });
            if (ui.openModal) ui.openModal('PAYMENT');
        }
        if (type === 'OPEN_CHAT' && meta && ui) {
            const loan = loans.find(l => l.id === meta.loanId);
            if (loan) {
                ui.setMessageModalLoan(loan);
                ui.openModal('MESSAGE_HUB');
            }
        }
    };

    switch (activeModal?.type) {
        case 'IMPORT_SHEET_SELECT':
            return (
                <Modal onClose={closeModal} title="Selecionar Aba">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-2">
                            {(ui.importSheets || []).map((sheet: any) => (
                                <button key={sheet.name} onClick={() => fileCtrl.startMapping(sheet)} className="w-full p-5 bg-slate-950 border border-slate-800 rounded-full text-left hover:border-blue-500 hover:bg-slate-900 transition-all font-black uppercase text-xs text-white flex justify-between items-center group">
                                    {sheet.name}
                                    <Table className="text-slate-700 group-hover:text-blue-500" size={16}/>
                                </button>
                            ))}
                        </div>
                    </div>
                </Modal>
            );

        case 'IMPORT_MAPPING':
            return (
                <Modal onClose={closeModal} title="Mapear Colunas">
                    <div className="space-y-6">
                        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            {FIELD_MAPS.map(field => (
                                <div key={field.key} className="flex items-center gap-4 bg-slate-950 p-3 rounded-full border border-slate-800">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-blue-500 uppercase">{field.key.replace('_', ' ')}</p>
                                    </div>
                                    <div className="relative group">
                                        <select 
                                            value={ui.importMapping?.[field.key] ?? ''} 
                                            onChange={e => ui.setImportMapping({...ui.importMapping, [field.key]: e.target.value === '' ? undefined : parseInt(e.target.value)})}
                                            className="appearance-none bg-slate-900 border border-slate-700 rounded-full px-3 py-2 pr-8 text-xs text-white outline-none focus:border-blue-500 min-w-[150px] cursor-pointer"
                                        >
                                            <option value="">Ignorar</option>
                                            {(ui.importCurrentSheet?.headers || []).map((h: string, i: number) => (
                                                <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14}/>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => fileCtrl.generatePreview(activeUser, clients)} className="w-full py-4 bg-blue-600 text-white font-black rounded-full uppercase text-xs flex items-center justify-center gap-2">
                            Visualizar Importação <ArrowRight size={16}/>
                        </button>
                    </div>
                </Modal>
            );

        case 'IMPORT_PREVIEW':
            return (
                <Modal onClose={closeModal} title="Curadoria de Clientes">
                    <div className="space-y-4">
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
                            {(ui.importCandidates || []).map((c: any, i: number) => {
                                const isSelected = ui.selectedImportIndices?.includes(i);
                                return (
                                    <div key={i} className={`flex items-start gap-3 p-4 border-b border-slate-900 last:border-0 hover:bg-slate-900/50 transition-colors cursor-pointer ${c.status === 'ERRO' ? 'opacity-50' : ''}`} onClick={() => c.status !== 'ERRO' && (isSelected ? ui.setSelectedImportIndices(ui.selectedImportIndices.filter((x:any)=>x!==i)) : ui.setSelectedImportIndices([...ui.selectedImportIndices, i]))}>
                                        <div className={isSelected ? 'text-blue-500' : 'text-slate-700'}>{isSelected ? <CheckSquare size={20}/> : <Square size={20}/>}</div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-white uppercase">{c.nome}</h4>
                                            <p className="text-[9px] text-slate-500">{c.documento} • {c.whatsapp}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => fileCtrl.executeImport(activeUser, clients, fetchFullData)} disabled={(ui.selectedImportIndices?.length || 0) === 0 || ui.isSaving} className="w-full py-5 bg-emerald-600 text-white font-black rounded-full uppercase">
                            {ui.isSaving ? <Loader2 className="animate-spin mx-auto" /> : `Importar ${ui.selectedImportIndices?.length || 0} Clientes`}
                        </button>
                    </div>
                </Modal>
            );

        case 'RESET_DATA':
            return <ResetDataModal ui={ui} closeModal={closeModal} activeUser={activeUser} onExecute={profileCtrl.handleResetData} />;
        
        case 'DELETE_ACCOUNT':
            return <DeleteAccountModal ui={ui} closeModal={closeModal} activeUser={activeUser} onExecute={profileCtrl.handleDeleteAccount} />;

        case 'CALC': return <CalculatorModal onClose={closeModal} />;
        case 'FLOW': return activeUser ? <FlowModal loans={loans} /> : null;
        case 'MESSAGE_HUB': return ui.messageModalLoan ? <MessageHubModal loan={ui.messageModalLoan} client={clients.find((c: any) => c.id === ui.messageModalLoan?.clientId)} onClose={closeModal} /> : null;
        case 'RECEIPT': return ui.showReceipt && activeUser ? <ReceiptModal data={ui.showReceipt} onClose={closeModal} userName={activeUser.businessName || activeUser.name || 'Empresa'} userDoc={activeUser.document} /> : null;
        case 'AI_ASSISTANT': return <AIAssistantModal onClose={closeModal} onCommandDetected={aiCtrl.handleAICommand} loans={loans} sources={sources} activeUser={activeUser} />;
        case 'SUPPORT_CHAT': return activeUser ? <OperatorSupportChat activeUser={activeUser} onClose={closeModal} /> : null;
        case 'NOTE': return <NoteWrapper />;
        case 'CONFIRMATION': return ui.confirmation ? (
            <Modal onClose={closeModal} title="Confirmação">
                <div className="space-y-4 text-center">
                    <p className="text-white text-lg font-bold">{ui.confirmation.title || 'Tem certeza?'}</p>
                    <p className="text-slate-400 text-sm">{ui.confirmation.message || 'Essa ação não pode ser desfeita.'}</p>
                    
                    {/* RESTAURAÇÃO DO CHECKBOX DE ESTORNO */}
                    {ui.confirmation.showRefundOption && (
                       <div className="flex items-center justify-center gap-2 bg-slate-950 p-3 rounded-full border border-slate-800 cursor-pointer" onClick={() => ui.setRefundChecked(!ui.refundChecked)}>
                           <input 
                                type="checkbox" 
                                id="refundCheck" 
                                checked={!!ui.refundChecked} 
                                onChange={e => ui.setRefundChecked(e.target.checked)} 
                                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer" 
                           />
                           <label htmlFor="refundCheck" className="text-sm text-slate-300 font-bold select-none cursor-pointer">Devolver capital para a Fonte?</label>
                       </div>
                    )}

                    <div className="flex gap-4 pt-2">
                        <button onClick={closeModal} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-full font-bold uppercase">Cancelar</button>
                        <button 
                            onClick={loanCtrl.executeConfirmation} 
                            className={`flex-1 py-3 text-white rounded-full font-bold uppercase ${
                                ['DELETE', 'DELETE_CLIENT', 'DELETE_SOURCE', 'REVERSE_TRANSACTION'].includes(ui.confirmation.type || '') 
                                ? 'bg-rose-600' 
                                : ui.confirmation.type === 'RESTORE' ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </Modal>
        ) : null;
        default: return null;
    }
};
