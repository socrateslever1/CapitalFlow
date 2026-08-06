import { supabase } from '../lib/supabase';
import { Client, LegalDocumentParams, UserProfile } from '../types';
import { createLegalSnapshot, generateSHA256 } from '../utils/crypto';
import { addDaysUTC } from '../utils/dateHelpers';
import { generateMutuoPreDesembolsoHTML } from '../features/legal/templates/MutuoPreDesembolsoTemplate';
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
  witness1Name?: string;
  witness1Doc?: string;
  witness2Name?: string;
  witness2Doc?: string;
  avalistaNome?: string;
  avalistaCPF?: string;
  tipoGarantia?: string;
  descricaoGarantia?: string;
};

export type CreatePreContractOptions = {
  clientId: string;
  amount: number;
  dueDate?: string;
  notes?: string;
  operatorProfileId?: string;
  witness1Name?: string;
  witness1Doc?: string;
  witness2Name?: string;
  witness2Doc?: string;
  avalistaNome?: string;
  avalistaCPF?: string;
  tipoGarantia?: string;
  descricaoGarantia?: string;
};

export const clientPreContractService = {
  async create(options: CreatePreContractOptions) {
    const { data: client, error: clientErr } = await supabase
      .from('clientes')
      .select('id, name, document, phone, address, city, state, owner_id, registration_status')
      .eq('id', options.clientId)
      .single();

    if (clientErr || !client) throw new Error('Cliente não encontrado no sistema.');

    const registrationStatus = String(client.registration_status || '').toUpperCase();
    if (!['APPROVED', 'PORTAL'].includes(registrationStatus)) {
      throw new Error('O documento pré-desembolso só pode ser enviado após a aprovação do cadastro do cliente.');
    }

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
      witness1Name: options.witness1Name,
      witness1Doc: options.witness1Doc,
      witness2Name: options.witness2Name,
      witness2Doc: options.witness2Doc,
      avalistaNome: options.avalistaNome,
      avalistaCPF: options.avalistaCPF,
      tipoGarantia: options.tipoGarantia,
      descricaoGarantia: options.descricaoGarantia,
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

    const witnesses: Array<{ name: string; document: string }> = [];
    if (input.witness1Name || input.witness1Doc) {
      witnesses.push({ name: input.witness1Name || '', document: input.witness1Doc || '' });
    }
    if (input.witness2Name || input.witness2Doc) {
      witnesses.push({ name: input.witness2Name || '', document: input.witness2Doc || '' });
    }

    const params: LegalDocumentParams & {
      clientId: string;
      requiredSignatureRoles?: string[];
      witnesses?: any[];
      witness1Name?: string;
      witness1Doc?: string;
      witness2Name?: string;
      witness2Doc?: string;
      incluirAvalista?: boolean;
      avalistaNome?: string;
      avalistaCPF?: string;
      incluirGarantia?: boolean;
      tipoGarantia?: string;
      descricaoGarantia?: string;
      legalDocumentKind?: string;
      effectivenessCondition?: string;
    } = {
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
      originDescription: `Capital previsto para futura disponibilização ao cliente ${client.name}. A obrigação somente nasce após comprovação do desembolso.`,
      city: profile.city || client.city || 'Manaus',
      state: profile.state || client.state || 'AM',
      contractDate: today,
      timestamp: new Date().toISOString(),
      templateId: 'MUTUO_PRE_DESEMBOLSO',
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
      witnesses: witnesses.length > 0 ? witnesses : undefined,
      witness1Name: input.witness1Name,
      witness1Doc: input.witness1Doc,
      witness2Name: input.witness2Name,
      witness2Doc: input.witness2Doc,
      incluirAvalista: !!input.avalistaNome?.trim(),
      avalistaNome: input.avalistaNome?.trim() || undefined,
      avalistaCPF: input.avalistaCPF?.trim() || undefined,
      incluirGarantia: !!input.descricaoGarantia?.trim(),
      tipoGarantia: input.tipoGarantia?.trim() || 'BEM EM GARANTIA',
      descricaoGarantia: input.descricaoGarantia?.trim() || undefined,
      legalDocumentKind: 'MUTUO_PRE_DESEMBOLSO',
      effectivenessCondition: 'EFFECTIVE_ONLY_AFTER_CONFIRMED_DISBURSEMENT',
    };

    const snapshotStr = createLegalSnapshot(params);
    const hash = await generateSHA256(snapshotStr);
    const renderedHtml = generateMutuoPreDesembolsoHTML(params, undefined, hash);

    const { data, error } = await supabase
      .from('documentos_juridicos')
      .insert({
        client_id: resolvedClientId,
        registration_link_id: portalLink.linkId,
        profile_id: ownerId,
        dono_id: ownerId,
        tipo: 'MUTUO_PRE_DESEMBOLSO',
        tipo_documento: 'MUTUO_PRE_DESEMBOLSO',
        snapshot: params,
        snapshot_json: params,
        snapshot_rendered_html: renderedHtml,
        hash_sha256: hash,
        view_token: viewToken,
        public_access_token: viewToken,
        status_assinatura: 'PENDENTE',
        status: 'AGUARDANDO_ASSINATURA',
        template_version: 'MUTUO_PRE_DESEMBOLSO_V1',
        testemunhas: witnesses,
      })
      .select('id,view_token')
      .single();

    if (error) throw new Error(error.message || 'Não foi possível criar o documento para assinatura.');

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://capflow.pages.dev';
    return {
      documentId: data.id as string,
      portalUrl: portalLink.url,
      signUrl: `${origin}/?legal_sign=${encodeURIComponent(String(data.view_token || viewToken))}&role=DEBTOR`,
      status: 'AGUARDANDO_ASSINATURA' as const,
    };
  },
};
