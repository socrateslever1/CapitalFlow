import { supabase } from '../lib/supabase';
import { Client, LegalDocumentParams, UserProfile } from '../types';
import { addDaysUTC } from '../utils/dateHelpers';
import { generateMutuoPreDesembolsoHTML } from '../features/legal/templates/MutuoPreDesembolsoTemplate';
import { clientRegistrationService } from './clientRegistration.service';
import { buildPreContractNotice } from '../features/legal/services/preContractNotice';
import { triggerManualCollection } from './n8nManualCollectionTrigger.service';

const toMoney = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
};

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

export type CreatePreContractOptions = ClientPreContractInput & {
  clientId: string;
  operatorProfileId?: string;
};

const editableStatuses = ['PENDENTE', 'PENDING', 'AJUSTE_SOLICITADO', 'RECUSADO', 'AGUARDANDO_ASSINATURA', 'DRAFT'];

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

    return this.createAndSend(client as any, fallbackProfile, options);
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
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = input.dueDate || addDaysUTC(today, 30).toISOString().slice(0, 10);

    const witnesses: Array<{ name: string; document: string }> = [];
    if (input.witness1Name || input.witness1Doc) {
      witnesses.push({ name: input.witness1Name || '', document: input.witness1Doc || '' });
    }
    if (input.witness2Name || input.witness2Doc) {
      witnesses.push({ name: input.witness2Name || '', document: input.witness2Doc || '' });
    }

    const params: LegalDocumentParams & Record<string, any> = {
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

    const renderedHtml = generateMutuoPreDesembolsoHTML(params);

    const { data: latest } = await supabase
      .from('documentos_juridicos')
      .select('id,status_assinatura')
      .eq('client_id', resolvedClientId)
      .eq('tipo', 'MUTUO_PRE_DESEMBOLSO')
      .in('status_assinatura', editableStatuses)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase.rpc('create_documento_juridico_versionado', {
      p_base_document_id: latest?.id || null,
      p_client_id: resolvedClientId,
      p_loan_id: null,
      p_tipo: 'MUTUO_PRE_DESEMBOLSO',
      p_snapshot: params,
      p_rendered_html: renderedHtml,
      p_profile_id: ownerId,
      p_registration_link_id: portalLink.linkId || null,
    });

    const created = Array.isArray(data) ? data[0] : data;
    if (error || !created?.id) {
      throw new Error(error?.message || 'Não foi possível criar a versão jurídica para assinatura.');
    }

    const phone = String(client.phone || '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 13) {
      throw new Error('Documento criado, mas o WhatsApp do cliente nao esta cadastrado ou e invalido.');
    }

    const notice = buildPreContractNotice({
      clientName: client.name,
      signUrl: portalLink.url,
      portalUrl: portalLink.url,
    });

    const { error: queueError } = await supabase
      .from('whatsapp_queue')
      .upsert({
        profile_id: ownerId,
        phone,
        message: `[[CF_CUSTOM]] ${notice.message}`,
        status: 'PENDING',
        loan_id: null,
        dedupe_key: `precontract:${created.id}:client`,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

    if (queueError) {
      throw new Error(`Documento criado, mas falhou ao enviar para o n8n: ${queueError.message}`);
    }

    await triggerManualCollection(ownerId);

    return {
      documentId: created.id as string,
      documentVersion: Number(created.document_version || 1),
      portalUrl: portalLink.url,
      signUrl: portalLink.url,
      status: 'AGUARDANDO_ASSINATURA' as const,
    };
  },
};
