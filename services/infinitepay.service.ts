import { supabase } from '../lib/supabase';

export type InfinitePayCheckoutInput = {
  loanId: string;
  installmentId: string;
  amount: number;
  payerName?: string;
  payerEmail?: string;
  payerDoc?: string;
  payerPhone?: string;
  returnUrl?: string;
};

export async function createInfinitePayCheckout(input: InfinitePayCheckoutInput) {
  const { data, error } = await supabase.functions.invoke('infinitepay-create-checkout', {
    body: {
      loan_id: input.loanId,
      installment_id: input.installmentId,
      amount: input.amount,
      payer_name: input.payerName || 'Cliente',
      payer_email: input.payerEmail || 'cliente@capitalflow.app',
      payer_doc: input.payerDoc || '',
      payer_phone: input.payerPhone || '',
      return_url: input.returnUrl || window.location.href,
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha ao gerar checkout InfinitePay.');
  }

  if (!data?.ok || !data?.checkout_url) {
    throw new Error(data?.error || 'Erro ao gerar checkout InfinitePay.');
  }

  return {
    checkoutUrl: data.checkout_url as string,
    chargeId: data.charge_id as string | undefined,
    externalReference: data.external_reference as string | undefined,
  };
}
