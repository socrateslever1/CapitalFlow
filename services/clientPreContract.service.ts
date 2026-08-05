import { supabase } from '../lib/supabase';
import { Client, LegalDocumentParams, UserProfile } from '../types';
import { createLegalSnapshot, generateSHA256 } from '../utils/crypto';
import { addDaysUTC } from '../utils/dateHelpers';
import { generateConfissaoDividaV2HTML } from '../features/legal/templates/ConfissaoDividaV2Template';
import { clientRegistrationService } from './clientRegistration.service';

const toMoney = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

const makeViewToken = () => crypto.randomUUID();

export type ClientPreContractInput = {
  amount: number;
  dueDate?: string;
  notes?: string;
};

export const clientPreContractService = {
  async createAndSend(client: Client, profile: UserProfile, input: ClientPreContractInput) {
    const amount = toMoney(input.amount);
    if (amount <= 0) throw new Error('Informe um valor maior que zero.');
    if (!client.document) throw new Error('Cliente sem CPF/CNPJ cadastrado.');
    if (!client.address) throw new Error('Cliente sem endereco cadastrado.');

    const portalLink = await clientRegistrationService.createClientAccessLink(client.id);
    const viewToken = makeViewToken();
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = input.dueDate || addDaysUTC(today, 30).toISOString().slice(0, 10);

    const params: LegalDocumentParams & { clientId: string; requiredSignatureRoles?: string[] } = {
      loanId: client.id,
      clientId: client.id,
      clientName: client.name,
      debtorName: client.name,
      debtorDoc: client.document,
      debtorPhone: client.phone,
      debtorAddress: client.address,
      creditorName: profile.fullName || profile.businessName || profile.name,
      creditorDoc: profile.document || 'Nao informado',
      creditorAddress: profile.address || [profile.city, profile.state].filter(Boolean).join(' - ') || 'Nao informado',
      amount,
      principalAmount: amount,
      originalPrincipalAmount: amount,
      principalPaidAmount: 0,
      legalInterestRatePercent: 0,
      legalInterestAmount: 0,
      legalTotalAmount: amount,
      totalDebt: amount,
      originDescription: `Proposta juridica de credito vinculada ao cliente ${client.name}.`,
      city: profile.city || client.city || 'Manaus',
      state: profile.state || client.state || 'AM',
      contractDate: today,
      timestamp: new Date().toISOString(),
      templateId: 'CONFISSAO_UNICO',
      contractDurationDays: Math.max(1, Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)),
      installments: [{
        id: `pre-${client.id}`,
        agreementId: '',
        number: 1,
        dueDate,
        amount,
        principalAmount: amount,
        legalInterestAmount: 0,
        principalBalanceAfter: 0,
        status: 'PENDING',
        paidAmount: 0,
      }],
      requiredSignatureRoles: ['DEBTOR'],
      customContent: input.notes?.trim() || undefined,
    };

    const snapshotStr = createLegalSnapshot(params);
    const hash = await generateSHA256(snapshotStr);
    const renderedHtml = generateConfissaoDividaV2HTML(params, undefined, hash);

    const { data, error } = await supabase
      .from('documentos_juridicos')
      .insert({
        client_id: client.id,
        registration_link_id: portalLink.linkId,
        profile_id: profile.id,
        dono_id: profile.id,
        tipo: 'PRE_CONTRATO',
        tipo_documento: 'PRE_CONTRATO',
        snapshot: params,
        snapshot_json: params,
        snapshot_rendered_html: renderedHtml,
        hash_sha256: hash,
        view_token: viewToken,
        public_access_token: viewToken,
        status_assinatura: 'PENDENTE',
        status: 'PENDENTE',
        testemunhas: [],
      })
      .select('id,view_token')
      .single();

    if (error) throw new Error(error.message || 'Nao foi possivel criar o documento para assinatura.');

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    return {
      documentId: data.id as string,
      portalUrl: portalLink.url,
      signUrl: `${origin}/?legal_sign=${encodeURIComponent(String(data.view_token || viewToken))}&role=DEBTOR`,
    };
  },
};
