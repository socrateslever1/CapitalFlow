import React, { useMemo, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, MessageCircle, Share2 } from 'lucide-react';
import { Loan, Installment } from '../../types';
import { Modal } from '../ui/Modal';
import { sanitizeRichHtml } from '../../utils/sanitizeHtml';

type ReceiptSendFormat = 'TEXT' | 'IMAGE' | 'PDF';

const escapeHtml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const formatCurrency = (value: number) =>
    Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const receiptCss = `
    .receipt-paper {
        width: 100%;
        max-width: 720px;
        background: #ffffff;
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.14);
        overflow: hidden;
        color: #0f172a;
        font-family: Inter, Arial, Helvetica, sans-serif;
    }
    .receipt-header {
        display: flex;
        gap: 16px;
        align-items: center;
        padding: 24px;
        border-bottom: 1px solid #e2e8f0;
        background: linear-gradient(135deg, #f8fafc 0%, #ecfdf5 100%);
    }
    .brand-mark {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        background: #059669;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        letter-spacing: -0.04em;
        flex: 0 0 auto;
    }
    .eyebrow, .label {
        margin: 0 0 5px;
        color: #64748b;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .12em;
        text-transform: uppercase;
    }
    .receipt-paper h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .muted {
        margin: 4px 0 0;
        color: #64748b;
        font-size: 12px;
    }
    .status-row, .details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 20px 24px;
    }
    .status-row {
        border-bottom: 1px dashed #cbd5e1;
    }
    .details-grid {
        border-top: 1px solid #e2e8f0;
    }
    .value {
        margin: 0;
        font-size: 14px;
        font-weight: 800;
        overflow-wrap: anywhere;
    }
    .amount-box {
        margin: 22px 24px;
        padding: 18px 20px;
        border-radius: 8px;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
    }
    .amount-box p {
        margin: 0;
        color: #047857;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .12em;
    }
    .amount-box strong {
        color: #047857;
        font-size: 30px;
        line-height: 1;
        white-space: nowrap;
    }
    .declaration {
        margin: 0 24px 22px;
        padding: 16px;
        border-radius: 8px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        color: #334155;
        font-size: 13px;
        line-height: 1.65;
    }
    .receipt-footer {
        padding: 18px 24px 24px;
        border-top: 1px dashed #cbd5e1;
    }
    .auth {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #0f172a;
        font-size: 13px;
        font-weight: 800;
        overflow-wrap: anywhere;
    }
    @media (max-width: 520px) {
        .receipt-header, .status-row, .details-grid, .receipt-footer { padding-left: 16px; padding-right: 16px; }
        .status-row, .details-grid { grid-template-columns: 1fr; }
        .amount-box { margin-left: 16px; margin-right: 16px; flex-direction: column; align-items: flex-start; }
        .amount-box strong { font-size: 26px; }
        .declaration { margin-left: 16px; margin-right: 16px; }
    }
`;

export const ReceiptModal = ({
    data,
    onClose,
    userName,
    userDoc,
}: {
    data: { loan: Loan; inst: Installment; amountPaid: number; type: string };
    onClose: () => void;
    userName: string;
    userDoc?: string;
}) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [sendFormat, setSendFormat] = useState<ReceiptSendFormat>('TEXT');
    const [sendStatus, setSendStatus] = useState('');
    const [isPreparing, setIsPreparing] = useState(false);

    const issuedAt = useMemo(() => new Date(), []);
    const receiptNumber = useMemo(() => {
        const seed = `${data.inst.id || data.loan.id}-${data.amountPaid}-${data.type}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        return Math.abs(hash).toString().slice(0, 6).padStart(6, '0');
    }, [data.amountPaid, data.inst.id, data.loan.id, data.type]);

    const authCode = useMemo(() => {
        const seed = `${data.inst.id || data.loan.id}-${data.amountPaid}-${data.type}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        return `${String(data.inst.id || data.loan.id).substring(0, 4).toUpperCase()}-${Math.abs(hash).toString(36).toUpperCase()}`;
    }, [data.inst.id, data.loan.id, data.amountPaid, data.type]);

    const issuedDate = issuedAt.toLocaleDateString('pt-BR');
    const issuedTime = issuedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const receiptDescription = data.type === 'FULL' ? 'Amortização / Quitação' : 'Pagamento de juros';
    const receiptReference = data.type === 'FULL' ? 'Quitação de parcela' : 'Pagamento de juros / Renovação';

    const receiptText = useMemo(() => {
        return `*COMPROVANTE DE PAGAMENTO*\n` +
            `--------------------------------\n` +
            `*Credor:* ${userName}\n` +
            `*Data:* ${issuedDate} às ${issuedTime}\n` +
            `*Recibo:* ${receiptNumber}\n` +
            `--------------------------------\n` +
            `*Pagador:* ${data.loan.debtorName}\n` +
            `*CPF/CNPJ:* ${data.loan.debtorDocument || 'Não informado'}\n` +
            `*Referente:* ${receiptReference}\n` +
            `*Contrato:* ${data.loan.id.substring(0, 8).toUpperCase()}\n` +
            `--------------------------------\n` +
            `*VALOR PAGO:* ${formatCurrency(data.amountPaid)}\n` +
            `--------------------------------\n` +
            `Autenticação: ${authCode}\n\n` +
            `Obrigado pela pontualidade.`;
    }, [authCode, data.amountPaid, data.loan.debtorDocument, data.loan.debtorName, data.loan.id, issuedDate, issuedTime, receiptNumber, receiptReference, userName]);

    const buildWhatsAppUrl = () => {
        const phone = String(data.loan.debtorPhone || '').replace(/\D/g, '');
        const finalPhone = phone.startsWith('55') ? phone : `55${phone}`;
        return `https://wa.me/${finalPhone}?text=${encodeURIComponent(receiptText)}`;
    };

    const receiptBodyHtml = useMemo(() => {
        const debtorDoc = data.loan.debtorDocument || 'Não informado';
        const creditorDoc = userDoc || 'Não informado';
        const contractId = data.loan.id.substring(0, 8).toUpperCase();

        return `
            <section class="receipt-paper">
                <header class="receipt-header">
                    <div class="brand-mark">CF</div>
                    <div>
                        <p class="eyebrow">Comprovante de pagamento</p>
                        <h1>${escapeHtml(userName)}</h1>
                        <p class="muted">CPF/CNPJ do credor: ${escapeHtml(creditorDoc)}</p>
                    </div>
                </header>

                <div class="status-row">
                    <div>
                        <p class="label">Recibo</p>
                        <p class="value">Nº ${escapeHtml(receiptNumber)}</p>
                    </div>
                    <div>
                        <p class="label">Emissão</p>
                        <p class="value">${escapeHtml(issuedDate)} às ${escapeHtml(issuedTime)}</p>
                    </div>
                </div>

                <div class="amount-box">
                    <p>Valor pago</p>
                    <strong>${escapeHtml(formatCurrency(data.amountPaid))}</strong>
                </div>

                <div class="details-grid">
                    <div>
                        <p class="label">Pagador</p>
                        <p class="value">${escapeHtml(data.loan.debtorName)}</p>
                    </div>
                    <div>
                        <p class="label">CPF/CNPJ do pagador</p>
                        <p class="value">${escapeHtml(debtorDoc)}</p>
                    </div>
                    <div>
                        <p class="label">Referente</p>
                        <p class="value">${escapeHtml(receiptDescription)}</p>
                    </div>
                    <div>
                        <p class="label">Contrato</p>
                        <p class="value">${escapeHtml(contractId)}</p>
                    </div>
                </div>

                <div class="declaration">
                    Declaro para os devidos fins que recebi de <strong>${escapeHtml(data.loan.debtorName)}</strong>
                    o valor de <strong>${escapeHtml(formatCurrency(data.amountPaid))}</strong>, referente a
                    <strong>${escapeHtml(receiptReference.toLowerCase())}</strong>.
                </div>

                <footer class="receipt-footer">
                    <div>
                        <p class="label">Autenticação eletrônica</p>
                        <p class="auth">${escapeHtml(authCode)}</p>
                    </div>
                    <p class="muted">Documento gerado pelo CapitalFlow.</p>
                </footer>
            </section>
        `;
    }, [authCode, data.amountPaid, data.loan.debtorDocument, data.loan.debtorName, data.loan.id, issuedDate, issuedTime, receiptDescription, receiptNumber, receiptReference, userDoc, userName]);

    const printDocumentHtml = () => `
        <!doctype html>
        <html lang="pt-BR">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Comprovante ${escapeHtml(receiptNumber)}</title>
                <style>
                    :root {
                        color: #0f172a;
                        background: #f8fafc;
                        font-family: Inter, Arial, Helvetica, sans-serif;
                    }
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        padding: 28px 16px;
                        background: #e2e8f0;
                    }
                    ${receiptCss}
                    .print-actions {
                        position: fixed;
                        top: 16px;
                        right: 16px;
                        display: flex;
                        gap: 8px;
                    }
                    .print-actions button {
                        border: 0;
                        border-radius: 8px;
                        background: #0f172a;
                        color: #fff;
                        padding: 10px 14px;
                        font-weight: 900;
                        text-transform: uppercase;
                        font-size: 11px;
                        cursor: pointer;
                    }
                    @page { size: A4; margin: 12mm; }
                    @media print {
                        body {
                            background: #fff;
                            padding: 0;
                            display: block;
                        }
                        .receipt-paper {
                            max-width: none;
                            box-shadow: none;
                            border-color: #cbd5e1;
                        }
                        .print-actions { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="print-actions">
                    <button onclick="window.print()">Imprimir ou salvar em PDF</button>
                </div>
                ${receiptBodyHtml}
                <script>setTimeout(() => window.print(), 300);</script>
            </body>
        </html>
    `;

    const printReceipt = () => {
        const win = window.open('', '_blank', 'width=820,height=900');
        if (!win) {
            setSendStatus('Permita pop-ups para imprimir ou salvar o comprovante.');
            return;
        }
        win.document.open();
        win.document.write(printDocumentHtml());
        win.document.close();
        setSendStatus('Não foi possível gerar o arquivo. Abri a impressão para salvar em PDF.');
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const canShareFile = (file: File) => {
        if (!navigator.share || !navigator.canShare) return false;
        return navigator.canShare({ files: [file] });
    };

    const shareFile = async (file: File, fallbackMessage: string) => {
        if (canShareFile(file)) {
            await navigator.share({
                files: [file],
                title: 'Comprovante de pagamento',
                text: 'Comprovante de pagamento CapitalFlow',
            });
            setSendStatus('Arquivo enviado para o compartilhamento do aparelho.');
            return;
        }

        downloadBlob(file, file.name);
        setSendStatus(fallbackMessage);
    };

    const renderReceiptCanvas = async () => {
        if (!receiptRef.current) throw new Error('Prévia do comprovante não encontrada.');
        const html2canvas = (await import('html2canvas')).default;
        return html2canvas(receiptRef.current, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
        });
    };

    const canvasToBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
        new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Não foi possível gerar o arquivo.'));
            }, type);
        });

    const buildFileName = (extension: 'png' | 'pdf') =>
        `comprovante-${authCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${extension}`;

    const generateImageFile = async () => {
        const canvas = await renderReceiptCanvas();
        const blob = await canvasToBlob(canvas, 'image/png');
        return new File([blob], buildFileName('png'), { type: 'image/png' });
    };

    const generatePdfFile = async () => {
        const canvas = await renderReceiptCanvas();
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const margin = 10;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imageWidth = pageWidth - (margin * 2);
        const imageHeight = Math.min((canvas.height * imageWidth) / canvas.width, pageHeight - (margin * 2));
        const imageData = canvas.toDataURL('image/png');

        pdf.addImage(imageData, 'PNG', margin, margin, imageWidth, imageHeight);
        return new File([pdf.output('blob')], buildFileName('pdf'), { type: 'application/pdf' });
    };

    const sendTextToWhatsApp = () => {
        window.open(buildWhatsAppUrl(), '_blank');
        setSendStatus('');
    };

    const generateAndDeliverPdf = async () => {
        try {
            const pdfFile = await generatePdfFile();
            await shareFile(pdfFile, 'PDF gerado e baixado. Anexe no WhatsApp se precisar enviar ao cliente.');
        } catch {
            printReceipt();
        }
    };

    const sendImageOrFallback = async () => {
        try {
            const imageFile = await generateImageFile();
            if (!canShareFile(imageFile)) {
                setSendStatus('Envio de imagem indisponível neste navegador. Gerando PDF...');
                await generateAndDeliverPdf();
                return;
            }
            await shareFile(imageFile, 'Imagem enviada para o compartilhamento do aparelho.');
        } catch {
            await generateAndDeliverPdf();
        }
    };

    const handlePrimaryAction = async () => {
        if (isPreparing) return;
        setSendStatus('');

        if (sendFormat === 'TEXT') {
            sendTextToWhatsApp();
            return;
        }

        setIsPreparing(true);
        try {
            if (sendFormat === 'IMAGE') await sendImageOrFallback();
            else await generateAndDeliverPdf();
        } finally {
            setIsPreparing(false);
        }
    };

    const primaryLabel = isPreparing
        ? 'Preparando...'
        : sendFormat === 'TEXT'
            ? 'Enviar texto no WhatsApp'
            : sendFormat === 'IMAGE'
                ? 'Enviar imagem'
                : 'Gerar PDF';

    return (
        <Modal onClose={onClose} title="Comprovante Oficial">
            <div className="flex flex-col items-center">
                <style>{receiptCss}</style>
                <div
                    ref={receiptRef}
                    className="w-full max-w-sm bg-white text-slate-900 border border-slate-200 shadow-xl overflow-hidden mb-6"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(receiptBodyHtml) }}
                />

                <div className="flex flex-col w-full gap-3">
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { value: 'TEXT' as const, label: 'Texto', icon: MessageCircle },
                            { value: 'IMAGE' as const, label: 'Imagem', icon: ImageIcon },
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
                                    className={`py-3 rounded-lg font-black uppercase text-[10px] flex items-center justify-center gap-1.5 transition-all border ${
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
                        onClick={handlePrimaryAction}
                        disabled={isPreparing}
                        className="w-full py-4 bg-emerald-600 text-white rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-70 transition-all shadow-lg shadow-emerald-600/20"
                    >
                        <Share2 size={18} /> {primaryLabel}
                    </button>
                    {sendStatus && <p className="text-center text-[11px] font-bold text-slate-400">{sendStatus}</p>}
                </div>
            </div>
        </Modal>
    );
};
