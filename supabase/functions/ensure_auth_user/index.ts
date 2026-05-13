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
  if (req.method !== "POST") return json(req, { ok: false, error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(req, { ok: false, error: "Missing Supabase env vars" }, 500);
    }

    const token = getBearerToken(req);
    if (!token) {
      return json(req, { ok: false, error: "Unauthorized: missing bearer token" }, 401);
    }

    // Cliente com contexto do usuário autenticado
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Cliente admin (service role)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authData?.user?.id) {
      return json(req, { ok: false, error: "Unauthorized: invalid token" }, 401);
    }

    const callerUserId = authData.user.id;

    // Resolve perfil do chamador
    const { data: callerProfile, error: callerProfileErr } = await supabaseAdmin
      .from("perfis")
      .select("id, user_id")
      .eq("user_id", callerUserId)
      .maybeSingle();

    if (callerProfileErr || !callerProfile?.id) {
      return json(req, { ok: false, error: "Forbidden: caller profile not found" }, 403);
    }

    const body = await req.json();
    const { profile_id, email, password } = body || {};

    if (!profile_id || !email || !password) {
      return json(
        req,
        { ok: false, error: "Parâmetros obrigatórios ausentes: profile_id, email, password." },
        400,
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanPassword = String(password).trim();

    if (!cleanEmail.includes("@")) {
      return json(req, { ok: false, error: "E-mail inválido." }, 400);
    }

    if (cleanPassword.length < 6) {
      return json(req, { ok: false, error: "Senha deve ter ao menos 6 caracteres." }, 400);
    }

    // Regra segura: só pode sincronizar o próprio profile_id
    if (String(profile_id) !== String(callerProfile.id)) {
      return json(req, { ok: false, error: "Forbidden: profile mismatch." }, 403);
    }

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("perfis")
      .select("id, user_id")
      .eq("id", profile_id)
      .maybeSingle();

    if (targetErr || !targetProfile?.id) {
      return json(req, { ok: false, error: "Perfil de destino não encontrado." }, 404);
    }

    const { data: userData, error: getError } = await supabaseAdmin.auth.admin.getUserByEmail(cleanEmail);
    if (getError && !getError.message?.toLowerCase().includes("user not found")) {
      throw new Error(`Erro ao consultar Auth: ${getError.message}`);
    }

    let authUserId = "";

    if (userData?.user?.id) {
      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userData.user.id,
        { password: cleanPassword, email: cleanEmail },
      );
      if (updateError) throw new Error(`Erro ao atualizar usuário: ${updateError.message}`);
      authUserId = updated.user.id;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
      });
      if (createError) throw new Error(`Erro ao criar usuário: ${createError.message}`);
      authUserId = created.user.id;
    }

    const { error: profileError } = await supabaseAdmin
      .from("perfis")
      .update({ user_id: authUserId })
      .eq("id", profile_id);

    if (profileError) {
      throw new Error(`Auth OK, mas falha ao vincular perfil: ${profileError.message}`);
    }

    return json(req, { ok: true, user_id: authUserId }, 200);
  } catch (error: any) {
    console.error("[ensure_auth_user] error:", error?.message || error);
    return json(req, { ok: false, error: error?.message || "Internal error" }, 500);
  }
});
