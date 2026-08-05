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

export type CreatePreContractOptions = {
  clientId: string;
  amount: number;
  dueDate?: string;
  notes?: string;
  operatorProfileId?: string;
};

export const clientPreContractService = {
  async create(options: CreatePreContractOptions) {
    const { data: client, error: clientErr } = await supabase
      .from('clientes')
      .select('id, name, document, phone, address, city, state, owner_id')
      .eq('id', options.clientId)
      .single();

    if (clientErr || !client) throw new Error('Cliente não encontrado no sistema.');

    let profile: any = null;
    if (options.operatorProfileId) {
      const { data: prof } = await supabase
        .from('perfis')
        .select('id, name, full_name, business_name, document, address, city, state')
        .eq('id', options.operatorProfileId)
        .maybeSingle();
      profile = prof;
    }

    if (!profile) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        const { data: prof } = await supabase
          .from('perfis')
          .select('id, name, full_name, business_name, document, address, city, state')
          .eq('user_id', userId)
          .maybeSingle();
        profile = prof;
      }
    }

    const fallbackProfile: UserProfile = {
      id: profile?.id || options.operatorProfileId || client.owner_id || 'system',
      name: profile?.name || profile?.full_name || 'Operador',
      fullName: profile?.full_name || profile?.name || 'Operador',
      businessName: profile?.business_name || profile?.name || 'Operador',
      document: profile?.document || 'Nao informado',
      address: profile?.address || 'Nao informado',
      city: profile?.city || client.city || 'Manaus',
      state: profile?.state || client.state || 'AM',
    } as any;

    return this.createAndSend(client as any, fallbackProfile, {
      amount: options.amount,
      dueDate: options.dueDate,
      notes: options.notes,
    });
  },

  async createAndSend(client: Client, profile: UserProfile, input: ClientPreContractInput) {
    const amount = toMoney(input.amount);
    if (amount <= 0) throw new Error('Informe um valor maior que zero.');
    if (!client.document) throw new Error('Cliente sem CPF/CNPJ cadastrado.');
    if (!client.address) throw new Error('Cliente sem endereço cadastrado.');

    const ownerId = (client as any).owner_id || (profile as any).supervisor_id || profile.id;
    const portalLink = await clientRegistrationService.createClientAccessLink(client.id, {
      profileId: ownerId,
      document: client.document,
      phone: client.phone,
    });
    const resolvedClientId = portalLink.clientId;
    const viewToken = makeViewToken();
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = input.dueDate || addDaysUTC(today, 30).toISOString().slice(0, 10);

    const params: LegalDocumentParams & { clientId: string; requiredSignatureRoles?: string[] } = {
      loanId: resolvedClientId,
      clientId: resolvedClientId,
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
      originDescription: `Proposta jurídica de crédito vinculada ao cliente ${client.name}.`,
      city: profile.city || client.city || 'Manaus',
      state: profile.state || client.state || 'AM',
      contractDate: today,
      timestamp: new Date().toISOString(),
      templateId: 'CONFISSAO_UNICO',
      contractDurationDays: Math.max(1, Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)),
      installments: [{
        id: `pre-${resolvedClientId}`,
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
        client_id: resolvedClientId,
        registration_link_id: portalLink.linkId,
        profile_id: ownerId,
        dono_id: ownerId,
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

    if (error) throw new Error(error.message || 'Não foi possível criar o documento para assinatura.');

    // Marca a inscrição como APROVADA no banco de dados para garantir abertura imediata do portal
    await supabase
      .from('clientes')
      .update({ registration_status: 'APPROVED' })
      .eq('id', resolvedClientId);

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    return {
      documentId: data.id as string,
      portalUrl: portalLink.url,
      signUrl: `${origin}/?legal_sign=${encodeURIComponent(String(data.view_token || viewToken))}&role=DEBTOR`,
    };
  },
};
