
import { LegalDocumentParams } from "../../../types";
import { formatMoney } from "../../../utils/formatters";
import { asString, asNumber, asArray } from "../../../utils/safe";

export const buildConfissaoDividaVM = (data: LegalDocumentParams) => {
    return {
        creditorName: asString(data.creditorName, 'CREDOR NÃO IDENTIFICADO').toUpperCase(),
        creditorDoc: asString(data.creditorDoc, 'N/A'),
        creditorAddress: asString(data.creditorAddress, '__________________'),
        debtorName: asString(data.debtorName, 'DEVEDOR NÃO IDENTIFICADO').toUpperCase(),
        debtorDoc: asString(data.debtorDoc, 'N/A'),
        debtorPhone: asString(data.debtorPhone, 'N/A'),
        debtorAddress: asString(data.debtorAddress, 'Endereço não informado'),
        totalDebt: formatMoney(asNumber(data.totalDebt)),
        discount: formatMoney(asNumber(data.discount)),
        gracePeriod: asNumber(data.gracePeriod),
        downPayment: formatMoney(asNumber(data.downPayment)),
        originDescription: asString(data.originDescription, 'Dívida reconhecida'),
        installments: asArray(data.installments),
        city: asString(data.city, 'Manaus').toUpperCase(),
        // Qualificação Credor
        creditorNationality: asString(data.creditorNationality, 'brasileiro(a)'),
        creditorMaritalStatus: asString(data.creditorMaritalStatus, 'estado civil não informado'),
        creditorProfession: asString(data.creditorProfession, 'profissão não informada'),
        creditorRG: asString(data.creditorRG, 'N/A'),
        // Qualificação Devedor
        debtorNationality: asString(data.debtorNationality, 'brasileiro(a)'),
        debtorMaritalStatus: asString(data.debtorMaritalStatus, 'estado civil não informado'),
        debtorProfession: asString(data.debtorProfession, 'profissão não informada'),
        debtorRG: asString(data.debtorRG, 'N/A'),
        date: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    };
};
