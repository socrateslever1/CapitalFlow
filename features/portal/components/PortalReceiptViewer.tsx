import React, { useMemo, useEffect, useState } from 'react';
import { FileText, Printer, ShieldCheck, RefreshCw } from 'lucide-react';
import { portalService } from '../../../services/portal.service';
import { mapLoanFromDB } from '../../../services/adapters/loanAdapter';

const receiptCss = `
  .receipt-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 24px 16px;
    width: 100%;
    min-height: 100vh;
    background: #0f172a;
    color: #f8fafc;
  }
  .receipt-paper {
    width: 100%;
    max-width: 580px;
    background: #ffffff;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
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
    font-size: 20px;
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
    font-size: 18px;
    line-height: 1.2;
    font-weight: 800;
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
    font-size: 13px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .amount-box {
    margin: 22px 24px;
    padding: 18px 20px;
    border-radius: 8px;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    display: flex;
    align-items: center;
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
    font-size: 28px;
    font-weight: 900;
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
    font-size: 12px;
    font-weight: 800;
    overflow-wrap: anywhere;
  }
  .print-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #2563eb;
    color: #ffffff;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 12px;
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
    transition: all 0.2s;
  }
  .print-btn:hover {
    background: #1d4ed8;
  }
  @media print {
    body {
      background: #ffffff;
    }
    .receipt-container {
      background: #ffffff;
      padding: 0;
    }
    .receipt-paper {
      box-shadow: none;
      border: none;
      max-width: 100%;
    }
    .print-actions {
      display: none !important;
    }
  }
`;

export const PortalReceiptViewer: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = urlParams.get('portal') || '';
  const code = urlParams.get('portal_code') || urlParams.get('code') || '';
  const installmentId = urlParams.get('installment_id') || '';

  useEffect(() => {
    const loadData = async () => {
      if (!token || !code || !installmentId) {
        setError('Link de comprovante incompleto ou inválido.');
        setLoading(false);
        return;
      }

      try {
        const client = await portalService.fetchClientByPortal(token, code);
        if (!client) throw new Error('Cliente do portal não localizado.');

        const contracts = await portalService.fetchClientContractsByPortal(token, code);
        const { installments } = await portalService.fetchLoanDetailsByPortal(token, code);

        // Achar a parcela solicitada
        const inst = installments.find((i: any) => i.id === installmentId);
        if (!inst) throw new Error('Parcela não localizada.');

        // Achar o contrato associado
        const rawContract = contracts.find((c: any) => c.id === inst.loan_id);
        if (!rawContract) throw new Error('Contrato da parcela não localizado.');

        // Mapear o contrato
        const contract = mapLoanFromDB(rawContract, installments);

        const amountPaid = Number(inst.paid_total || inst.valor_parcela || 0);

        // Semente de número do recibo e autenticação
        const seed = `${inst.id}-${amountPaid}-FULL`;
        let hash = 0;
        for (let i = 0; i < seed.length; i += 1) {
          hash = (hash << 5) - hash + seed.charCodeAt(i);
        }
        const receiptNumber = Math.abs(hash).toString().slice(0, 6).padStart(6, '0');
        const authCode = `${String(inst.id).substring(0, 4).toUpperCase()}-${Math.abs(hash).toString(36).toUpperCase()}`;

        const paidDate = inst.paid_date ? new Date(inst.paid_date) : new Date();

        setReceiptData({
          clientName: client.name,
          clientDoc: client.document || 'Não informado',
          creditorName: rawContract.creditorName || 'Empresa Credora',
          creditorDoc: rawContract.creditorDocument || 'Não informado',
          contractId: String(contract.id).substring(0, 8).toUpperCase(),
          installmentNumber: inst.numero_parcela,
          amountPaid,
          receiptNumber,
          authCode,
          issuedDate: paidDate.toLocaleDateString('pt-BR'),
          issuedTime: paidDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        });
      } catch (err: any) {
        console.error('Erro ao carregar comprovante:', err);
        setError(err.message || 'Erro ao carregar comprovante.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, code, installmentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 gap-4">
        <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin" />
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest animate-pulse">Carregando Comprovante...</p>
      </div>
    );
  }

  if (error || !receiptData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-md w-full text-center">
          <ShieldCheck size={48} className="mx-auto text-rose-500 mb-4" />
          <h2 className="text-white font-black text-xl mb-2">Comprovante Indisponível</h2>
          <p className="text-slate-400 text-sm mb-4">{error || "Não foi possível carregar as informações."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="receipt-container">
      <style dangerouslySetInnerHTML={{ __html: receiptCss }} />
      <div className="receipt-paper">
        <header className="receipt-header">
          <div className="brand-mark">CF</div>
          <div>
            <p className="eyebrow">Comprovante de pagamento</p>
            <h1>{receiptData.creditorName}</h1>
            <p className="muted">CPF/CNPJ do credor: {receiptData.creditorDoc}</p>
          </div>
        </header>

        <div className="status-row">
          <div>
            <p className="label">Recibo</p>
            <p className="value">Nº {receiptData.receiptNumber}</p>
          </div>
          <div>
            <p className="label">Emissão</p>
            <p className="value">{receiptData.issuedDate} às {receiptData.issuedTime}</p>
          </div>
        </div>

        <div className="amount-box">
          <p>Valor pago</p>
          <strong>{receiptData.amountPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>

        <div className="details-grid">
          <div>
            <p className="label">Pagador</p>
            <p className="value">{receiptData.clientName}</p>
          </div>
          <div>
            <p className="label">CPF/CNPJ do pagador</p>
            <p className="value">{receiptData.clientDoc}</p>
          </div>
          <div>
            <p className="label">Referente</p>
            <p className="value">Amortização / Quitação (Parcela #{receiptData.installmentNumber})</p>
          </div>
          <div>
            <p className="label">Contrato</p>
            <p className="value">{receiptData.contractId}</p>
          </div>
        </div>

        <div className="declaration">
          Declaro para os devidos fins que recebi de <strong>{receiptData.clientName}</strong> o valor de <strong>{receiptData.amountPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>, referente à quitação de parcela.
        </div>

        <footer className="receipt-footer">
          <div>
            <p className="label">Autenticação eletrônica</p>
            <p className="auth">{receiptData.authCode}</p>
          </div>
          <p className="muted mt-2">Documento gerado pelo CapitalFlow.</p>
        </footer>
      </div>

      <div className="print-actions mt-6">
        <button className="print-btn" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir Comprovante / PDF
        </button>
      </div>
    </div>
  );
};
