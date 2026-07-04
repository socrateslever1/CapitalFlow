
import { generateNotaPromissoriaHTML } from "./NotaPromissoriaTemplate";
import { generateConfissaoDividaV2HTML } from "./ConfissaoDividaV2Template";
import { formatBRDate } from "../../../utils/dateHelpers";

export const DocumentTemplates = {
    /**
     * @deprecated Use confissaoDivida (unified V2) instead.
     */
    confissaoDividaParcelado: (data: any) => generateConfissaoDividaV2HTML(data),

    /**
     * @deprecated Use confissaoDivida (unified V2) instead.
     */
    confissaoDividaUnico: (data: any) => generateConfissaoDividaV2HTML(data),

    /**
     * Unified and Robust Legal Template (V2 "Winner Text")
     * Handles both single payment and installment scenarios automatically.
     */
    confissaoDivida: (data: any) => generateConfissaoDividaV2HTML(data),

    notificacao: (data: any) => `
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.5; color: #000; max-width: 800px; margin: auto;">
            <h2 style="text-align: center; text-transform: uppercase;">Notificação Extrajudicial</h2>
            <p style="text-align: right;">${data.city}, ${new Date().toLocaleDateString('pt-BR')}</p>
            
            <p><strong>A/C Sr(a). ${data.debtorName}</strong><br/>CPF/CNPJ: ${data.debtorDoc}</p>
            
            <p style="margin-top: 30px;">Pela presente notificação, informamos que consta em aberto o débito referente ao contrato <strong>${data.loanId.substring(0,8)}</strong>, vencido em ${formatBRDate(data.dueDate)}, no valor total atualizado de <strong>${(data.totalDue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.</p>
            
            <p>Solicitamos a regularização do pagamento em até 48 horas para evitar a adoção de medidas judiciais cabíveis e registro em órgãos de proteção ao crédito.</p>
            
            <p style="margin-top: 50px; text-align: center;">Atenciosamente,<br/><strong>${data.creditorName}</strong></p>
        </div>
    `,

    quitacao: (data: any) => `
        <div style="font-family: serif; padding: 50px; line-height: 1.8; color: #000; max-width: 850px; margin: auto; border: 1px solid #ccc;">
            <h1 style="text-align: center; text-transform: uppercase;">Termo de Quitação</h1>
            
            <p>Pelo presente instrumento, eu, <strong>${data.creditorName}</strong>, inscrito(a) no CPF/CNPJ sob o nº ${data.creditorDoc}, declaro para os devidos fins que recebi de <strong>${data.debtorName}</strong>, CPF/CNPJ nº ${data.debtorDoc}, a importância de <strong>${(data.totalPaid || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>, referente à liquidação integral do contrato <strong>${data.loanId.substring(0,8)}</strong>.</p>
            
            <p>Com o recebimento desta quantia, dou ao devedor plena, geral e irrevogável quitação de toda e qualquer obrigação referente ao citado contrato, nada mais tendo a reclamar em tempo algum.</p>
            
            <p style="margin-top: 40px; text-align: center;">${data.city}, ${new Date().toLocaleDateString('pt-BR')}</p>
            
            <div style="margin-top: 60px; text-align: center; border-top: 1px solid #000; width: 60%; margin: auto; padding-top: 10px;">
                <strong>${data.creditorName}</strong><br/>Credor
            </div>
        </div>
    `,

    notaPromissoria: (data: any) => generateNotaPromissoriaHTML(data as any)
};
