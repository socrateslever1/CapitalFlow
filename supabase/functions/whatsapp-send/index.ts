import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare const Deno: any;

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "*";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = APP_ORIGIN === "*" ? "*" : origin === APP_ORIGIN ? origin : APP_ORIGIN;
  return { ...baseCorsHeaders, "Access-Control-Allow-Origin": allowOrigin };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { success: false, error: "Method Not Allowed" }, 405);

  let requestBody: any = null;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, { success: false, error: "Missing Supabase env vars" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
      requestBody = await req.json();
    } catch {
      return json(req, { success: false, error: "Invalid JSON body" }, 400);
    }

    const { profile_id, phone, message, queue_id, is_test } = requestBody || {};

    let targetProfileId = profile_id;
    let targetPhone = phone;
    let targetMessage = message;

    // Se vier do trigger de banco com um queue_id
    if (queue_id) {
      // 1. Marca como processando na fila
      const { data: queueItem, error: queueFetchError } = await supabaseAdmin
        .from("whatsapp_queue")
        .update({ status: 'PROCESSING', attempts: 1 }) // Incrementa tentativa
        .eq("id", queue_id)
        .select()
        .maybeSingle();

      if (queueFetchError || !queueItem) {
        return json(req, { success: false, error: "Item de fila não localizado" }, 404);
      }

      targetProfileId = queueItem.profile_id;
      targetPhone = queueItem.phone;
      targetMessage = queueItem.message;
    }

    if (!targetProfileId || !targetPhone || !targetMessage) {
      const errText = "Parâmetros obrigatórios ausentes: profile_id, phone, message.";
      if (queue_id) {
        await supabaseAdmin.from("whatsapp_queue").update({ status: 'ERROR', error_message: errText }).eq("id", queue_id);
      }
      return json(req, { success: false, error: errText }, 400);
    }

    // 2. Busca as configurações de WhatsApp do operador
    const { data: config, error: configError } = await supabaseAdmin
      .from("whatsapp_configs")
      .select("*")
      .eq("profile_id", targetProfileId)
      .maybeSingle();

    if (configError || !config) {
      const errText = "Integração do WhatsApp não configurada para este operador.";
      if (queue_id) {
        await supabaseAdmin.from("whatsapp_queue").update({ status: 'ERROR', error_message: errText }).eq("id", queue_id);
      }
      return json(req, { success: false, error: errText }, 400);
    }

    // Limpa o telefone para garantir apenas números
    const cleanPhone = String(targetPhone).replace(/\D/g, "");
    
    // Mapeia DDI brasileiro 55
    let finalPhone = cleanPhone;
    if (!finalPhone.startsWith("55") && finalPhone.length >= 10) {
      finalPhone = `55${finalPhone}`;
    }

    let apiResponse;
    let responseText = "";
    
    // 3. Dispara conforme o Gateway selecionado
    if (config.api_type === 'META') {
      const phoneId = config.instance_id; // Na Meta, salvamos o Phone Number ID em instance_id
      if (!phoneId) throw new Error("ID do Número de Telefone (Phone Number ID) ausente na configuração da Meta.");

      const metaUrl = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
      
      apiResponse = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token}`
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: finalPhone,
          type: "text",
          text: {
            preview_url: true,
            body: targetMessage
          }
        })
      });
      
    } else if (config.api_type === 'EVOLUTION') {
      const evolutionUrl = `${config.api_url}/message/sendText/${config.instance_id}`;
      
      apiResponse = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.token
        },
        body: JSON.stringify({
          number: finalPhone,
          text: targetMessage,
          delay: 1200,
          linkPreview: true
        })
      });

    } else if (config.api_type === 'Z_API') {
      // O Z-API usa a URL estruturada com token e instance
      const zApiUrl = `${config.api_url}/instances/${config.instance_id}/token/${config.token}/send-text`;
      
      apiResponse = await fetch(zApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': config.token
        },
        body: JSON.stringify({
          phone: finalPhone,
          message: targetMessage
        })
      });
    } else {
      throw new Error(`Tipo de API de WhatsApp desconhecida: ${config.api_type}`);
    }

    try {
      responseText = await apiResponse.text();
    } catch {}

    if (!apiResponse.ok) {
      throw new Error(`Erro retornado pela API do WhatsApp (HTTP ${apiResponse.status}): ${responseText}`);
    }

    // 4. Sucesso no envio
    if (queue_id) {
      await supabaseAdmin
        .from("whatsapp_queue")
        .update({
          status: 'SENT',
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", queue_id);
    }

    return json(req, { success: true, response: responseText }, 200);

  } catch (error: any) {
    console.error("[whatsapp-send] Error:", error?.message || error);
    
    // Em caso de falha e se for envio de fila, atualiza na fila como erro
    if (requestBody?.queue_id) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") || "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
      );
      await supabaseAdmin
        .from("whatsapp_queue")
        .update({
          status: 'ERROR',
          error_message: error?.message || 'Erro de envio interno'
        })
        .eq("id", requestBody.queue_id);
    }

    return json(req, { success: false, error: error?.message || "Internal error" }, 500);
  }
});
