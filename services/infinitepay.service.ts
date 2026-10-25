import { supabase } from '../lib/supabase';
import { safeUUID } from '../utils/uuid';
import { paymentConfigService } from './paymentConfig.service';

export interface InfinitePayCheckoutInput {
  handle?: string;
  profile_id?: string;
  loan_id?: string;
  installment_id?: string;
  installment_ids?: string[];
  amount: number;
  payer_name?: string;
  payer_email?: string;
  payer_doc?: string;
  payer_phone?: string;
  return_url?: string;
  portal_token?: string;
  portal_code?: string;
}

export interface InfinitePayCheckoutResponse {
  ok: boolean;
  checkout_url?: string;
  charge_id?: string;
  external_reference?: string;
  error?: string;
  code?: string;
}

/**
 * Cria um link de checkout da InfinitePay.
 * 1. Tenta a Edge Function Supabase (infinitepay-create-checkout).
 * 2. Se a Edge Function não estiver implantada ou falhar (404/indisponível),
 *    executa o fallback direto via API /api/infinitepay/checkout do backend Express.
 */
export async function createInfinitePayCheckout(
  input: InfinitePayCheckoutInput
): Promise<InfinitePayCheckoutResponse> {
  const profileId = safeUUID(input.profile_id);

  // 1. Tentar Edge Function Supabase
  try {
    const { data, error } = await supabase.functions.invoke('infinitepay-create-checkout', {
      body: {
        loan_id: input.loan_id,
        installment_id: input.installment_id,
        installment_ids: input.installment_ids || (input.installment_id ? [input.installment_id] : []),
        amount: input.amount,
        payer_name: input.payer_name,
        payer_email: input.payer_email || 'cliente@capitalflow.app',
        payer_doc: input.payer_doc,
        payer_phone: input.payer_phone,
        portal_token: input.portal_token,
        portal_code: input.portal_code,
        return_url: input.return_url || (typeof window !== 'undefined' ? window.location.href : undefined),
      },
    });

    if (!error && data?.ok && data?.checkout_url) {
      return {
        ok: true,
        checkout_url: data.checkout_url,
        charge_id: data.charge_id,
        external_reference: data.external_reference,
      };
    }

    // Se o erro foi que a função não existe no Supabase, continua para o fallback local
    const errorMsg = String(error?.message || data?.error || '');
    if (!errorMsg.includes('Failed to send a request') && !errorMsg.includes('NOT_FOUND') && !errorMsg.includes('indisponivel')) {
      // Erro de validação de negócio (ex: valor zero)
      if (data?.error) {
        return { ok: false, error: data.error, code: data.code };
      }
    }
  } catch (err: any) {
    console.warn('[InfinitePay] Edge Function não respondeu, tentando fallback local...', err?.message);
  }

  // 2. Fallback local via backend Express (/api/infinitepay/checkout)
  try {
    let resolvedHandle = input.handle?.trim().replace(/^[@$]+/, '');

    // Se o handle não foi passado diretamente, tenta buscar no banco pelo profile_id
    if (!resolvedHandle && profileId) {
      const config = await paymentConfigService.getInfinitePayConfig(profileId);
      if (config?.infinitepay_handle) {
        resolvedHandle = config.infinitepay_handle.trim().replace(/^[@$]+/, '');
      }
    }

    if (!resolvedHandle) {
      return {
        ok: false,
        error: 'InfiniteTag não configurada. Informe sua tag da InfinitePay (ex: socrateslever) nas configurações.',
        code: 'HANDLE_NOT_CONFIGURED',
      };
    }

    const res = await fetch('/api/infinitepay/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        handle: resolvedHandle,
        amount: input.amount,
        loan_id: input.loan_id,
        installment_id: input.installment_id,
        installment_ids: input.installment_ids,
        payer_name: input.payer_name,
        payer_email: input.payer_email,
        payer_doc: input.payer_doc,
        payer_phone: input.payer_phone,
        return_url: input.return_url || (typeof window !== 'undefined' ? window.location.href : undefined),
      }),
    });

    const result = await res.json();
    return result;
  } catch (fallbackErr: any) {
    console.error('[InfinitePay] Falha no fallback local:', fallbackErr);
    return {
      ok: false,
      error: fallbackErr?.message || 'Falha ao gerar link da InfinitePay.',
    };
  }
}
