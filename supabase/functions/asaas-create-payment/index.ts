
// @ts-ignore Runtime Deno: import remoto resolvido no deploy/execucao da Edge Function.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore Runtime Deno: import remoto resolvido no deploy/execucao da Edge Function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const ASAAS_API_URL = "https://www.asaas.com/api/v3"; // Mudar para sandbox se necessário

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://capflow.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing env vars");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { loan_id, installment_id, amount, payment_method, credit_card, payer, portal_token, portal_code, installmentCount } = body;

    // 1. Validar Acesso (via Portal Token se for do portal)
    // Para simplificar aqui, vamos buscar o profile_id e o owner_id do contrato
    const { data: loan, error: loanErr } = await supabase
      .from("contratos")
      .select("id, profile_id, owner_id, client_id")
      .eq("id", loan_id)
      .single();

    if (loanErr || !loan) throw new Error("Contrato não encontrado");

    const targetProfileId = loan.profile_id || loan.owner_id;

    // 2. Buscar API Key do Operador
    const { data: asaasConfig } = await supabase
      .from("perfis_config_asaas")
      .select("asaas_api_key")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    if (!asaasConfig?.asaas_api_key) {
      throw new Error("Configuração Asaas não encontrada para este operador");
    }

    const API_KEY = asaasConfig.asaas_api_key;
    const isSandbox = API_KEY.includes("hmlg") || API_KEY.includes("sandbox") || !API_KEY.includes("prod");
    const asaasUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";

    // 3. Buscar ou Criar Cliente no Asaas
    // O Asaas exige um Customer ID. Vamos buscar por CPF/CNPJ
    const customerRes = await fetch(`${asaasUrl}/customers?cpfCnpj=${payer.cpfCnpj.replace(/\D/g, "")}`, {
        headers: { "access_token": API_KEY }
    });
    const customerData = await customerRes.json();
    let asaasCustomerId = customerData.data?.[0]?.id;

    if (!asaasCustomerId) {
        const createCustRes = await fetch(`${asaasUrl}/customers`, {
            method: "POST",
            headers: { 
                "access_token": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: payer.name,
                email: payer.email,
                cpfCnpj: payer.cpfCnpj.replace(/\D/g, "")
            })
        });
        const newCustData = await createCustRes.json();
        if (!createCustRes.ok) throw new Error(newCustData.errors?.[0]?.description || "Erro ao criar cliente no Asaas");
        asaasCustomerId = newCustData.id;
    }

    // 4. Criar Cobrança
    const paymentPayload: any = {
        customer: asaasCustomerId,
        billingType: payment_method, // 'CREDIT_CARD', 'PIX', 'BOLETO'
        dueDate: new Date().toISOString().split("T")[0],
        externalReference: installment_id || loan_id,
        description: `Pagamento CapitalFlow - Contrato ${loan_id.slice(0,8)}`
    };

    if (installmentCount && installmentCount > 1) {
        paymentPayload.installmentCount = installmentCount;
        paymentPayload.value = amount; // Valor total do parcelamento
    } else {
        paymentPayload.value = amount;
    }

    if (payment_method === 'CREDIT_CARD' && credit_card) {
        paymentPayload.creditCard = {
            holderName: credit_card.holderName,
            number: credit_card.number,
            expiryMonth: credit_card.expiryMonth,
            expiryYear: credit_card.expiryYear,
            ccv: credit_card.ccv
        };
        // Para cartão, o Asaas exige os dados do titular também
        const cleanPhone = (payer.phone || "").replace(/\D/g, "");
        paymentPayload.creditCardHolderInfo = {
            name: credit_card.holderName,
            email: payer.email,
            cpfCnpj: credit_card.holderCpf ? credit_card.holderCpf.replace(/\D/g, "") : payer.cpfCnpj.replace(/\D/g, ""),
            postalCode: credit_card.holderCep ? credit_card.holderCep.replace(/\D/g, "") : "01001000", // CEP do titular ou fallback
            addressNumber: "0",
            phone: cleanPhone.length >= 10 ? cleanPhone : "11999999999" // Fallback seguro
        };
    }

    const paymentRes = await fetch(`${asaasUrl}/payments`, {
        method: "POST",
        headers: {
            "access_token": API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(paymentPayload)
    });

    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) throw new Error(paymentData.errors?.[0]?.description || "Erro ao criar cobrança no Asaas");

    // 5. Salvar na payment_charges para rastreio
    const { error: insertErr } = await supabase.from("payment_charges").insert({
        loan_id: loan.id,
        installment_id: installment_id,
        provider: "ASAAS",
        provider_payment_id: String(paymentData.id),
        amount: amount,
        status: "PENDING",
        provider_status: paymentData.status,
        checkout_url: paymentData.invoiceUrl,
        currency: "BRL",
        external_reference: loan.id + "_" + installment_id
    });

    if (insertErr) {
        console.error("Erro ao salvar payment_charges:", insertErr);
        throw new Error("Erro interno ao registrar transação no banco: " + insertErr.message);
    }

    return new Response(JSON.stringify({
        ok: true,
        payment_id: paymentData.id,
        status: paymentData.status,
        invoice_url: paymentData.invoiceUrl,
        pix_qr_code: paymentData.pixQrCode // Se for PIX
    }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
