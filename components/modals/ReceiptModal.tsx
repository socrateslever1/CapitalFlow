
import React, { useMemo, useRef } from 'react';
import { Download, FileText, Printer, Receipt, Share2 } from 'lucide-react';
import { Loan, Installment } from '../../types';
import { Modal } from '../ui/Modal';

export const ReceiptModal = ({ data, onClose, userName, userDoc }: { data: {loan: Loan, inst: Installment, amountPaid: number, type: string}, onClose: () => void, userName: string, userDoc?: string }) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    // Código de autenticação estável
    const authCode = useMemo(() => {
        const seed = `${data.inst.id || data.loan.id}-${data.amountPaid}-${data.type}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        return `${String(data.inst.id || data.loan.id).substring(0, 4).toUpperCase()}-${Math.abs(hash).toString(36).toUpperCase()}`;
    }, [data.inst.id, data.loan.id, data.amountPaid, data.type]);

    const share = () => {
        const text = `*COMPROVANTE DE PAGAMENTO*\n` +
            `--------------------------------\n` +
            `*Beneficiário:* ${userName}\n` +
            `*Data:* ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}\n` +
            `--------------------------------\n` +
            `*Pagador:* ${data.loan.debtorName}\n` +
            `*CPF:* ${data.loan.debtorDocument}\n` +
            `*Referente:* ${data.type === 'FULL' ? 'Quitação de Parcela' : 'Pagamento de Juros/Renovação'}\n` +
            `--------------------------------\n` +
            `*VALOR PAGO:* R$ ${data.amountPaid.toFixed(2)}\n` +
            `--------------------------------\n` +
            `Autenticação: ${authCode}\n\n` +
            `Obrigado pela preferência!`;
        window.open(`https://wa.me/55${data.loan.debtorPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const renderCanvas = async () => {
        if (!receiptRef.current) return null;
        const html2canvas = (await import('html2canvas')).default;
        return html2canvas(receiptRef.current, { scale: 2, backgroundColor: '#fffdf5' });
    };

    const downloadPng = async () => {
        const canvas = await renderCanvas();
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `comprovante-${authCode}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const downloadPdf = async () => {
        const canvas = await renderCanvas();
        if (!canvas) return;
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const img = canvas.toDataURL('image/png');
        const width = 80;
        const height = (canvas.height * width) / canvas.width;
        pdf.addImage(img, 'PNG', 65, 12, width, height);
        pdf.save(`comprovante-${authCode}.pdf`);
    };

    const printReceipt = () => {
        const html = receiptRef.current?.outerHTML;
        if (!html) return;
        const win = window.open('', '_blank', 'width=420,height=720');
        if (!win) return;
        win.document.write(`<html><head><title>Comprovante</title><script src="https://cdn.tailwindcss.com"></script></head><body style="background:#fff;padding:20px;display:flex;justify-content:center">${html}</body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 400);
    };

    return (
        <Modal onClose={onClose} title="Comprovante Oficial">
            <div className="flex flex-col items-center">
                {/* VIZUALIZAÇÃO DO CUPOM (Para Print) */}
                <div ref={receiptRef} className="bg-[#fffdf5] text-slate-900 w-full max-w-sm mx-auto p-6 rounded-none shadow-xl border-t-8 border-emerald-600 relative overflow-hidden mb-6 font-mono text-sm leading-relaxed" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>

                    {/* Header Cupom */}
                    <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
                        <div className="flex justify-center mb-2 text-emerald-600">
                            <Receipt size={32} />
                        </div>
                        <h2 className="font-bold text-lg uppercase tracking-wider">{userName}</h2>
                        {userDoc && <p className="text-[10px] text-slate-500">CNPJ/CPF: {userDoc}</p>}
                        <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString()} às {new Date().toLocaleTimeString()}</p>
                    </div>

                    {/* Corpo Cupom */}
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

                    {/* Totais */}
                    <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 mb-4">
                        <div className="flex justify-between items-end">
                            <span className="font-bold text-slate-600 uppercase text-xs">Total Pago</span>
                            <span className="font-black text-xl text-emerald-600">R$ {data.amountPaid.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Footer Cupom */}
                    <div className="text-center text-[9px] text-slate-400 border-t-2 border-dashed border-slate-300 pt-4">
                        <p>Autenticação Eletrônica:</p>
                        <p className="font-mono mt-1 text-[10px] text-slate-500 break-all">{authCode}</p>
                        <p className="mt-2 italic">Obrigado pela pontualidade!</p>
                    </div>

                    {/* Efeito de Serrilha (Visual apenas) */}
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMiAxMCIgcHJlc2VydmVBc3BlY3RSYXRpbz0ibm9uZSI+PHBhdGggZD0iTTAgMTBMNiAwIDEyIDEweiIgZmlsbD0iIzBmMTcyYSIvPjwvc3ZnPg==')] bg-contain bg-bottom bg-repeat-x opacity-10"></div>
                </div>

                <div className="flex flex-col w-full gap-3">
                    <button onClick={share} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20">
                        <Share2 size={18} /> Enviar no WhatsApp
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={downloadPng} className="py-3 bg-slate-900 text-slate-200 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all"><Download size={14}/> PNG</button>
                        <button onClick={downloadPdf} className="py-3 bg-slate-900 text-slate-200 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all"><FileText size={14}/> PDF</button>
                        <button onClick={printReceipt} className="py-3 bg-slate-900 text-slate-200 rounded-xl font-black uppercase text-[10px] flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all"><Printer size={14}/> Imprimir</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
