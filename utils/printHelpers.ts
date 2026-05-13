
// Promissória do sistema (fallback): abre uma janela de impressão para o cliente salvar em PDF.
export const openSystemPromissoriaPrint = (args: {
  clientName: string;
  clientPhone?: string;
  loanId: string;
  loanCreatedAt?: string;
  principal?: number;
  interestRate?: number | string;
  debtorDocument?: string;
  totalToPay?: number;
}) => {
  const {
    clientName,
    clientPhone,
    loanId,
    loanCreatedAt,
    principal,
    interestRate,
    debtorDocument,
    totalToPay,
  } = args;

  const fmtMoney = (v?: number) =>
    typeof v === 'number' && !Number.isNaN(v)
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—';

  const fmtDate = (v?: string) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  };
  const computedTotalToPay = (() => {
    if (typeof totalToPay === 'number' && !Number.isNaN(totalToPay)) return totalToPay;
    const p = typeof principal === 'number' && !Number.isNaN(principal) ? principal : 0;
    const ir = Number(interestRate);
    if (!Number.isFinite(ir)) return p;
    return p * (1 + (ir / 100));
  })();

  const html = `
  <!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Promissória</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #0f172a; }
        h1 { font-size: 18px; margin: 0 0 12px; }
        .muted { color: #475569; font-size: 12px; }
        .box { border: 1px solid #cbd5e1; padding: 16px; margin-top: 12px; }
        .row { display: flex; gap: 12px; flex-wrap: wrap; }
        .col { flex: 1; min-width: 220px; }
        .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
        .value { font-size: 14px; font-weight: 700; }
        .divider { border-top: 1px dashed #cbd5e1; margin: 16px 0; }
        .sign { margin-top: 22px; }
        .line { border-bottom: 1px solid #0f172a; height: 20px; margin-top: 28px; }
        .small { font-size: 11px; color: #334155; margin-top: 6px; }
        @media print { body { margin: 0.8cm; } }
      </style>
    </head>
    <body>
      <h1>Promissória (Sistema)</h1>
      <div class="muted">
        Documento gerado automaticamente com base no contrato. Você pode imprimir ou salvar como PDF.
      </div>
      <div style="margin: 10px 0 16px 0;">
        <button onclick="window.print()" style="background:#0f172a;color:#fff;border:0;padding:10px 14px;border-radius:10px;font-weight:800;cursor:pointer;">Imprimir / Salvar PDF</button>
      </div>

      <div class="box">
        <div class="row">
          <div class="col">
            <div class="label">Cliente</div>
            <div class="value">${clientName || '—'}</div>
          </div>
          <div class="col">
            <div class="label">Telefone</div>
            <div class="value">${clientPhone || '—'}</div>
          </div>
          <div class="col">
            <div class="label">Documento (CPF/CNPJ do contrato)</div>
            <div class="value">${debtorDocument || '—'}</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="row">
          <div class="col">
            <div class="label">Contrato (ID)</div>
            <div class="value">${loanId || '—'}</div>
          </div>
          <div class="col">
            <div class="label">Data do contrato</div>
            <div class="value">${fmtDate(loanCreatedAt)}</div>
          </div>
        </div>

        <div class="row" style="margin-top: 12px;">
          <div class="col">
            <div class="label">Valor total a pagar</div>
            <div class="value">${fmtMoney(computedTotalToPay)}</div>
          </div>
        </div>

        <div class="sign">
          <div class="small">Assinatura do Devedor</div>
          <div class="line"></div>
          <div class="small">Assinatura do Credor</div>
          <div class="line"></div>
        </div>
      </div>
      <script>setTimeout(() => window.print(), 250);</script>
    </body>
  </html>
  `;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
};

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export const openDreReportPrint = async (args: {
    period: string;
    businessName: string;
    dre: { grossRevenue: number, principalRecovered: number, investment: number, cashFlow: number };
    transactions: any[];
}) => {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const { period, businessName, dre, transactions } = args;

    // Create a temporary container for the HTML
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.padding = '20px';
    container.style.background = 'white';
    container.style.color = '#1e293b';
    container.style.fontFamily = 'Arial, sans-serif';

    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">Relatório de Fechamento</h1>
            <p style="margin: 5px 0 0; color: #64748b;">${businessName}</p>
            <p style="margin: 5px 0 0;">Período: <strong>${period}</strong></p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px;">Receita Bruta</div>
                <div style="font-size: 18px; font-weight: bold; color: #10b981;">${fmt(dre.grossRevenue)}</div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px;">Recuperação</div>
                <div style="font-size: 18px; font-weight: bold; color: #3b82f6;">${fmt(dre.principalRecovered)}</div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px;">Aportes</div>
                <div style="font-size: 18px; font-weight: bold; color: #f43f5e;">${fmt(dre.investment)}</div>
            </div>
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; background: #f8fafc;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px;">Caixa Líquido</div>
                <div style="font-size: 18px; font-weight: bold;">${fmt(dre.cashFlow)}</div>
            </div>
        </div>

        <h3>Detalhamento das Operações</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: #f1f5f9;">
                    <th style="text-align: left; padding: 10px; text-transform: uppercase; font-size: 10px; color: #64748b;">Data</th>
                    <th style="text-align: left; padding: 10px; text-transform: uppercase; font-size: 10px; color: #64748b;">Cliente</th>
                    <th style="text-align: left; padding: 10px; text-transform: uppercase; font-size: 10px; color: #64748b;">Tipo</th>
                    <th style="text-align: right; padding: 10px; text-transform: uppercase; font-size: 10px; color: #64748b;">Valor</th>
                </tr>
            </thead>
            <tbody>
                ${transactions.map(t => `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(t.date).toLocaleDateString()}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${t.clientName}</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${t.type === 'LEND_MORE' ? 'Empréstimo' : 'Pagamento'}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${t.type === 'LEND_MORE' ? '#f43f5e' : '#10b981'}">
                            ${t.type === 'LEND_MORE' ? '-' : '+'} ${fmt(t.amount)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    document.body.appendChild(container);

    const canvas = await html2canvas(container);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Relatorio_${period.replace('/', '_')}.pdf`);

    document.body.removeChild(container);
};

export const generatePDF = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Elemento ${elementId} não encontrado`);

    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${filename}.pdf`);
};
