// Notificação push de fatura que fecha ou vence em até 3 dias (Fase 2.4B).
// Chamada uma vez por dia pela rotina do banco (pg_cron), identificada por segredo no Vault.
// O texto não leva valores (tela bloqueada). Cada aviso é marcado como enviado uma única vez.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

type Reminder = { r_owner: string; r_card: string; r_card_name: string; r_kind: 'CLOSE' | 'DUE'; r_event_date: string; r_days: number };

const when = (days: number) => (days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`);
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const secret = req.headers.get('x-reminder-secret') || '';
  const { data: allowed } = await admin.rpc('wallet_push_reminder_secret_ok', { p_secret: secret });
  if (allowed !== true) return reply({ error: 'unauthorized' }, 401);

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  if (!publicKey || !privateKey) return reply({ error: 'vapid_missing' }, 500);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || Deno.env.get('APP_ORIGIN') || 'mailto:noreply@example.com', publicKey, privateKey);

  const { data: reminders, error } = await admin.rpc('wallet_invoice_push_reminders', {});
  if (error) return reply({ error: 'reminders_failed' }, 500);

  let sent = 0;
  for (const reminder of (reminders || []) as Reminder[]) {
    const { data: profiles } = await admin.from('perfis').select('id').eq('user_id', reminder.r_owner);
    const profileIds = (profiles || []).map((profile: { id: string }) => profile.id);
    const { data: subscriptions } = profileIds.length
      ? await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('profile_id', profileIds)
      : { data: [] };
    const payload = JSON.stringify({
      title: reminder.r_kind === 'CLOSE' ? 'Fatura vai fechar' : 'Fatura vai vencer',
      body: `${reminder.r_card_name}: fatura ${reminder.r_kind === 'CLOSE' ? 'fecha' : 'vence'} ${when(reminder.r_days)} (${shortDate(reminder.r_event_date)}).`,
      url: '/carteira/cartoes',
      tag: `wallet-invoice-${reminder.r_card}-${reminder.r_kind}-${reminder.r_event_date}`,
    });
    await Promise.allSettled(((subscriptions || []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        );
        sent += 1;
      } catch (cause: any) {
        if (cause?.statusCode === 404 || cause?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id);
        }
      }
    }));
    // Marca mesmo sem aparelho inscrito: o aviso do dia não se repete.
    await admin.rpc('wallet_mark_push_reminder_sent', {
      p_owner: reminder.r_owner, p_card: reminder.r_card, p_kind: reminder.r_kind, p_event_date: reminder.r_event_date,
    });
  }
  return reply({ reminders: (reminders || []).length, sent });
});
