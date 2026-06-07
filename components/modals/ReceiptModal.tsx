import React, { useMemo, useRef, useState } from 'react';
import { FileText, Image, MessageCircle, Receipt, Share2 } from 'lucide-react';
import { Loan, Installment } from '../../types';
import { Modal } from '../ui/Modal';

type ReceiptSendFormat = 'TEXT' | 'PNG' | 'PDF';
type ShareNavigator = Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
};

export const ReceiptModal = ({ data, onClose, userName, userDoc }: { data: {loan: Loan, inst: Installment, amountPaid: number, type: string}, onClose: () => void, userName: string, userDoc?: string }) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [sendFormat, setSendFormat] = useState<ReceiptSendFormat>('TEXT');
    const [isSending, setIsSending] = useState(false);
    const [sendStatus, setSendStatus] = useState('');

    const authCode = useMemo(() => {
        const seed = `${data.inst.id || data.loan.id}-${data.amountPaid}-${data.type}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        return `${String(data.inst.id || data.loan.id).substring(0, 4).toUpperCase()}-${Math.abs(hash).toString(36).toUpperCase()}`;
    }, [data.inst.id, data.loan.id, data.amountPaid, data.type]);

    const receiptText = useMemo(() => {
        return `*COMPROVANTE DE PAGAMENTO*\n` +
            `--------------------------------\n` +
            `*Beneficiário:* ${userName}\n` +
            `*Data:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n` +
            `--------------------------------\n` +
            `*Pagador:* ${data.loan.debtorName}\n` +
            `*CPF:* ${data.loan.debtorDocument}\n` +
            `*Referente:* ${data.type === 'FULL' ? 'Quitação de Parcela' : 'Pagamento de Juros/Renovação'}\n` +
            `--------------------------------\n` +
            `*VALOR PAGO:* R$ ${data.amountPaid.toFixed(2)}\n` +
            `--------------------------------\n` +
            `Autenticação: ${authCode}\n\n` +
            `Obrigado pela preferência!`;
    }, [authCode, data.amountPaid, data.loan.debtorDocument, data.loan.debtorName, data.type, userName]);

    const openWhatsAppConversation = () => {
        const phone = data.loan.debtorPhone.replace(/\D/g, '');
        const finalPhone = phone.startsWith('55') ? phone : `55${phone}`;
        window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(receiptText)}`, '_blank');
    };

    const downloadFile = (file: File) => {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.download = file.name;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    const canvasToPngFile = (canvas: HTMLCanvasElement) => {
        return new Promise<File>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Não foi possível gerar o PNG do comprovante.'));
                    return;
                }
                resolve(new File([blob], `comprovante-${authCode}.png`, { type: 'image/png' }));
            }, 'image/png');
        });
    };

    const createPdfFile = async (canvas: HTMLCanvasElement) => {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const img = canvas.toDataURL('image/png');
        const width = 80;
        const height = (canvas.height * width) / canvas.width;
        pdf.addImage(img, 'PNG', 65, 12, width, height);
        const blob = pdf.output('blob');
        return new File([blob], `comprovante-${authCode}.pdf`, { type: 'application/pdf' });
    };

    const shareFileOrOpenWhatsApp = async (file: File) => {
        const shareApi = navigator as ShareNavigator;
        const shareData: ShareData = {
            title: 'Comprovante de pagamento',
            text: receiptText,
            files: [file],
        };

        if (shareApi.share && (!shareApi.canShare || shareApi.canShare(shareData))) {
            await shareApi.share(shareData);
            return;
        }

        downloadFile(file);
        openWhatsAppConversation();
        setSendStatus('Arquivo baixado. A conversa foi aberta para anexar o comprovante.');
    };

    const renderCanvas = async () => {
        if (!receiptRef.current) return null;
        const html2canvas = (await import('html2canvas')).default;
        return html2canvas(receiptRef.current, {
            scale: 1.5,
            backgroundColor: '#fffdf5',
            logging: false,
            useCORS: true,
        });
    };

    const sendToWhatsApp = async () => {
        if (isSending) return;
        setIsSending(true);
        setSendStatus(sendFormat === 'TEXT' ? 'Abrindo WhatsApp...' : 'Gerando comprovante...');

        try {
            if (sendFormat === 'TEXT') {
                openWhatsAppConversation();
                setSendStatus('');
                return;
            }

            const canvas = await renderCanvas();
            if (!canvas) throw new Error('Não foi possível gerar o comprovante.');
            const file = sendFormat === 'PNG'
                ? await canvasToPngFile(canvas)
                : await createPdfFile(canvas);
            await shareFileOrOpenWhatsApp(file);
        } catch (error) {
            console.error('Erro ao enviar comprovante:', error);
            setSendStatus('Não foi possível enviar o comprovante. Tente novamente.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Modal onClose={onClose} title="Comprovante Oficial">
            <div className="flex flex-col items-center">
                <div ref={receiptRef} className="bg-[#fffdf5] text-slate-900 w-full max-w-sm mx-auto p-6 rounded-none shadow-xl border-t-8 border-emerald-600 relative overflow-hidden mb-6 font-mono text-sm leading-relaxed" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
                    <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
                        <div className="flex justify-center mb-2 text-emerald-600">
                            <Receipt size={32} />
                        </div>
                        <h2 className="font-bold text-lg uppercase tracking-wider">{userName}</h2>
                        {userDoc && <p className="text-[10px] text-slate-500">CNPJ/CPF: {userDoc}</p>}
                        <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>

                    <div className="space-y-3 mb-4">
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-bold">RECIBO Nº</span>
                            <span className="font-bold">{Math.floor(Math.random() * 100000)}</span>
                        </div>
                        <div className="border-b border-slate-200 pb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Pagador</p>
                            <p className="font-bold uppercase truncate">{data.loan.debtorName}</p>
                            <p className="text-xs text-slate-500">{data.loan.debtorDocument}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Descrição</p>
                            <p className="font-bold">{data.type === 'FULL' ? 'AMORTIZAÇÃO / QUITAÇÃO' : 'PAGAMENTO DE JUROS'}</p>
                            <p className="text-xs text-slate-500">Ref. Contrato: {data.loan.id.substring(0, 8).toUpperCase()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 mb-4">
                        <div className="flex justify-between items-end">
                            <span className="font-bold text-slate-600 uppercase text-xs">Total Pago</span>
                            <span className="font-black text-xl text-emerald-600">R$ {data.amountPaid.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="text-center text-[9px] text-slate-400 border-t-2 border-dashed border-slate-300 pt-4">
                        <p>Autenticação Eletrônica:</p>
                        <p className="font-mono mt-1 text-[10px] text-slate-500 break-all">{authCode}</p>
                        <p className="mt-2 italic">Obrigado pela pontualidade!</p>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMiAxMCIgcHJlc2VydmVBc3BlY3RSYXRpbz0ibm9uZSI+PHBhdGggZD0iTTAgMTBMNiAwIDEyIDEweiIgZmlsbD0iIzBmMTcyYSIvPjwvc3ZnPg==')] bg-contain bg-bottom bg-repeat-x opacity-10"></div>
                </div>

                <div className="flex flex-col w-full gap-3">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { value: 'TEXT' as const, label: 'Texto', icon: MessageCircle },
                            { value: 'PNG' as const, label: 'PNG', icon: Image },
                            { value: 'PDF' as const, label: 'PDF', icon: FileText },
                        ].map((option) => {
                            const Icon = option.icon;
                            const active = sendFormat === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        setSendFormat(option.value);
                                        setSendStatus('');
                                    }}
                                    className={`py-3 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 transition-all border ${
                                        active
                                            ? 'bg-emerald-600 text-white border-emerald-500'
                                            : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800'
                                    }`}
                                >
                                    <Icon size={14} /> {option.label}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={sendToWhatsApp}
                        disabled={isSending}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-60 disabled:cursor-wait"
                    >
                        <Share2 size={18} /> {isSending ? 'Preparando...' : 'Enviar no WhatsApp'}
                    </button>
                    {sendStatus && <p className="text-center text-[11px] font-bold text-slate-400">{sendStatus}</p>}
                </div>
            </div>
        </Modal>
    );
};
