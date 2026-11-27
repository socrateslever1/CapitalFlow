-- Fase 2.4B: notificação push de fatura que fecha ou vence em até 3 dias.
-- O banco calcula pela regra de ciclo de cada cartão; uma rotina diária (pg_cron + pg_net)
-- chama a Edge Function wallet-invoice-reminders, que envia o push sem valores no texto.
-- Cada aviso é enviado uma única vez (tabela de enviados). Opção de desligar por cartão.

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.personal_wallet_cards
  add column if not exists push_reminders boolean not null default true;

create table if not exists public.personal_wallet_push_reminders_sent (
  owner_user_id uuid not null,
  card_id uuid not null references public.personal_wallet_cards(id) on delete cascade,
  kind text not null check (kind in ('CLOSE', 'DUE')),
  event_date date not null,
  sent_at timestamptz not null default now(),
  primary key (owner_user_id, card_id, kind, event_date)
);
alter table public.personal_wallet_push_reminders_sent enable row level security;
revoke all on public.personal_wallet_push_reminders_sent from public, anon, authenticated;

-- Lembretes pendentes de envio (só para a rotina do servidor).
create or replace function public.wallet_invoice_push_reminders(p_today date default null)
returns table(r_owner uuid, r_card uuid, r_card_name text, r_kind text, r_event_date date, r_days integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Manaus')::date);
  v_card public.personal_wallet_cards;
  v_open date;
  v_prev date;
  v_close date;
  v_due date;
  v_ignored date;
begin
  for v_card in
    select * from public.personal_wallet_cards k
     where k.status <> 'CANCELED' and k.due_day is not null and k.push_reminders
  loop
    begin
      v_open := private.wallet_card_cycle_month_for_date(v_card, v_today);
      select d.closing_date, d.due_date into v_close, v_ignored from private.wallet_card_cycle_dates(v_card, v_open) d;
      v_prev := (v_open - interval '1 month')::date;
      select d.due_date into v_due from private.wallet_card_cycle_dates(v_card, v_prev) d;
    exception when others then
      continue;
    end;
    if v_close - v_today between 0 and 3 and not exists (
        select 1 from public.personal_wallet_push_reminders_sent s
         where s.owner_user_id = v_card.owner_user_id and s.card_id = v_card.id and s.kind = 'CLOSE' and s.event_date = v_close) then
      r_owner := v_card.owner_user_id; r_card := v_card.id; r_card_name := v_card.nickname;
      r_kind := 'CLOSE'; r_event_date := v_close; r_days := v_close - v_today;
      return next;
    end if;
    -- Vencimento só avisa se a fatura ainda tem valor a pagar.
    if v_due - v_today between 0 and 3
       and coalesce(private.wallet_effective_cycle_amount(v_card.owner_user_id, v_card.id, v_prev), 0) > 0
       and not exists (
        select 1 from public.personal_wallet_push_reminders_sent s
         where s.owner_user_id = v_card.owner_user_id and s.card_id = v_card.id and s.kind = 'DUE' and s.event_date = v_due) then
      r_owner := v_card.owner_user_id; r_card := v_card.id; r_card_name := v_card.nickname;
      r_kind := 'DUE'; r_event_date := v_due; r_days := v_due - v_today;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.wallet_mark_push_reminder_sent(p_owner uuid, p_card uuid, p_kind text, p_event_date date)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  insert into public.personal_wallet_push_reminders_sent (owner_user_id, card_id, kind, event_date)
  values (p_owner, p_card, upper(p_kind), p_event_date)
  on conflict do nothing;
$$;

-- A rotina se identifica com um segredo guardado no Vault (nunca no código).
create or replace function public.wallet_push_reminder_secret_ok(p_secret text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(p_secret <> '' and p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'wallet_push_reminder_secret' limit 1), false);
$$;

revoke all on function public.wallet_invoice_push_reminders(date) from public, anon, authenticated;
revoke all on function public.wallet_mark_push_reminder_sent(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.wallet_push_reminder_secret_ok(text) from public, anon, authenticated;
grant execute on function public.wallet_invoice_push_reminders(date) to service_role;
grant execute on function public.wallet_mark_push_reminder_sent(uuid, uuid, text, date) to service_role;
grant execute on function public.wallet_push_reminder_secret_ok(text) to service_role;

do $setup$
begin
  if not exists (select 1 from vault.secrets where name = 'wallet_push_reminder_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'wallet_push_reminder_secret');
  end if;
  if exists (select 1 from cron.job where jobname = 'wallet-invoice-push-reminders') then
    perform cron.unschedule('wallet-invoice-push-reminders');
  end if;
  -- 12:00 UTC = 08:00 em Manaus.
  perform cron.schedule('wallet-invoice-push-reminders', '0 12 * * *', $cron$
    select net.http_post(
      url := 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/wallet-invoice-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminder-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'wallet_push_reminder_secret' limit 1)),
      body := '{}'::jsonb
    );
  $cron$);
end
$setup$;
