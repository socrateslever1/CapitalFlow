import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const allowedCheckoutHosts = new Set(["checkout.infinitepay.io", "api.infinitepay.io"]);

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Método não permitido.", { status: 405 });
  const code = new URL(req.url).searchParams.get("c") || "";
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(code)) return new Response("Link inválido.", { status: 404 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supabase.from("n8n_short_links")
    .select("target_url")
    .eq("code", code)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data?.target_url) return new Response("Este link expirou ou não existe.", { status: 404 });

  let target: URL;
  try {
    target = new URL(data.target_url);
  } catch {
    return new Response("Destino inválido.", { status: 400 });
  }
  if (target.protocol !== "https:" || !allowedCheckoutHosts.has(target.hostname)) {
    return new Response("Destino não autorizado.", { status: 403 });
  }
  return Response.redirect(target.toString(), 302);
});
