
import { LegalDocumentParams } from "../../../types";
import { formatMoney } from "../../../utils/formatters";
import { buildConfissaoDividaVM } from "../viewModels/confissaoVM";

export const generateNotaPromissoriaHTML = (data: LegalDocumentParams, docId?: string, hash?: string) => {
    const vm = buildConfissaoDividaVM(data);
    
    // Calcula data de vencimento final (última parcela) ou específica
    const lastInstallment = data.installments[data.installments.length - 1];
    const dueDate = lastInstallment ? new Date(lastInstallment.dueDate).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Nota Promissória</title>
        <style>
            @page { size: A4; margin: 3cm; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; max-width: 800px; margin: 0 auto; padding: 20px; background: #fff; }
            .promissoria-box { border: 4px double #000; padding: 30px; position: relative; background-image: radial-gradient(#f0f0f0 1px, transparent 1px); background-size: 10px 10px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
            .title { font-size: 24pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
            .value { font-size: 20pt; font-weight: bold; border: 2px solid #000; padding: 5px 15px; background: #fff; }
            .content { font-size: 14pt; line-height: 2; text-align: justify; margin-bottom: 40px; }
            .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; font-size: 11pt; }
            .detail-item strong { display: block; text-transform: uppercase; font-size: 9pt; color: #555; }
            .signatures { text-align: right; margin-top: 50px; }
            .sign-line { border-top: 1px solid #000; width: 60%; margin-left: auto; padding-top: 5px; text-align: center; }
            .footer-legal { 
                margin-top: 50px; 
                border-top: 1px dashed #000; 
                padding-top: 10px; 
                font-size: 8pt; 
                text-align: center; 
                color: #444;
                font-family: Arial, sans-serif;
            }
            .watermark { 
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); 
                font-size: 80pt; color: rgba(0,0,0,0.05); font-weight: bold; pointer-events: none; text-transform: uppercase; 
                z-index: 0;
            }
        </style>
    </head>
    <body>
        <div class="promissoria-box">
            <div class="watermark">NOTA PROMISSÓRIA</div>
            
            <div class="header">
                <div class="title">NOTA PROMISSÓRIA</div>
                <div class="value">${vm.totalDebt}</div>
            </div>

            <div class="details">
                <div class="detail-item">
                    <strong>Nº do Título</strong>
                    ${docId ? docId.substring(0,8).toUpperCase() : 'PENDENTE'}
                </div>
                <div class="detail-item">
                    <strong>Vencimento (Final)</strong>
                    ${dueDate}
                </div>
            </div>

            <div class="content">
                <p>
                    Aos <b>${new Date(data.contractDate).getDate()}</b> dias do mês de <b>${new Date(data.contractDate).toLocaleDateString('pt-BR', {month: 'long'})}</b> de <b>${new Date(data.contractDate).getFullYear()}</b>, pagarei(emos) por esta única via de <b>NOTA PROMISSÓRIA</b> a <b>${vm.creditorName}</b>, inscrito(a) no CPF/CNPJ sob o nº ${vm.creditorDoc}, ou à sua ordem, a quantia líquida e certa de <b>${vm.totalDebt}</b>${data.installments.length > 1 ? `, em ${data.installments.length} parcelas de ${formatMoney(data.installments[0].amount)},` : ''} em moeda corrente deste país.
                </p>
                <p style="font-size: 10pt; margin-top: 20px;">
                    <b>Praça de Pagamento:</b> ${vm.city}.
                </p>
            </div>

            <div class="details" style="border-top: 1px solid #ccc; padding-top: 20px;">
                <div class="detail-item">
                    <strong>Emitente (Devedor)</strong>
                    ${vm.debtorName}<br>
                    CPF/CNPJ: ${vm.debtorDoc}<br>
                    ${vm.debtorAddress}
                </div>
                <div class="detail-item">
                    <strong>Data de Emissão</strong>
                    ${vm.date}
                </div>
            </div>

            <div class="signatures">
                <div class="sign-line">
                    <b>${vm.debtorName}</b><br>
                    ASSINATURA DO EMITENTE<br>
                    <span style="font-size: 8pt;">(Assinado Eletronicamente)</span>
                </div>
            </div>
        </div>

        <div class="footer-legal">
            <p style="margin:0;">
                Este documento constitui título executivo extrajudicial, nos termos do artigo 784, inciso III, do Código de Processo Civil, assinado eletronicamente conforme a Lei nº 14.063/2020 e a Medida Provisória nº 2.200-2/2001, com integridade garantida por hash criptográfico (SHA-256), registro de data, hora e endereço IP.
            </p>
            <div style="margin-top: 5px;">
                ID Único: <b>${docId || 'PENDENTE'}</b> | Hash SHA-256: <b>${hash || 'GERANDO...'}</b>
            </div>
        </div>
    </body>
    </html>
    `;
};
