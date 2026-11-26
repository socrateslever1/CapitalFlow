-- Fase 1 de docs/PLANO_CARTEIRA_PARIDADE.md: ciclo do cartão.
--
-- 1.0 Resolvedor único: private.wallet_card_cycle_dates(cartão, mês de vencimento)
--     devolve fechamento e vencimento. O roteamento de compras passa a usá-lo.
-- 1.1 Configuração por mês: personal_wallet_card_cycle_settings guarda a regra
--     vigente a partir de cada mês. Editar o cartão vale do mês da edição em
--     diante; meses anteriores mantêm a regra antiga.
-- 1.2 Fechamento dinâmico: closing_mode = 'DAYS_BEFORE_DUE' fecha N dias antes
--     do vencimento.
-- 1.3 Vencimento em dia útil: sábado, domingo e feriado nacional passam para o
--     próximo dia útil (Carnaval, Sexta-feira Santa e Corpus Christi incluídos).
-- 1.4 Fechamento informado para um mês: closing_date em
--     personal_wallet_card_invoice_facts vale só para aquele mês.
--
-- Padrões reproduzem o comportamento atual: closing_mode 'FIXED_DAY',
-- due_business_days false, sem closing_date. Nenhum lançamento, parcela,
-- pagamento ou saldo existente é alterado. A única escrita em dados é a criação
-- da configuração inicial de cada cartão (cópia dos dias atuais).

begin;

-- 1.2 / 1.3: regras no cartão (valores atuais, usados quando não há histórico).
alter table public.personal_wallet_cards
  add column if not exists closing_mode text not null default 'FIXED_DAY',
  add column if not exists closing_days_before_due smallint,
  add column if not exists due_business_days boolean not null default false;
alter table public.personal_wallet_cards
  drop constraint if exists personal_wallet_cards_closing_mode_check,
  add constraint personal_wallet_cards_closing_mode_check
    check (closing_mode in ('FIXED_DAY', 'DAYS_BEFORE_DUE')),
  drop constraint if exists personal_wallet_cards_closing_days_before_due_check,
  add constraint personal_wallet_cards_closing_days_before_due_check
    check (closing_days_before_due is null or closing_days_before_due between 1 and 20),
  drop constraint if exists personal_wallet_cards_dynamic_closing_days_check,
  add constraint personal_wallet_cards_dynamic_closing_days_check
    check (closing_mode <> 'DAYS_BEFORE_DUE' or closing_days_before_due is not null);

-- 1.4: fechamento real informado para um mês.
alter table public.personal_wallet_card_invoice_facts
  add column if not exists closing_date date;
alter table public.personal_wallet_card_invoice_facts
  drop constraint if exists wallet_invoice_facts_closing_date,
  add constraint wallet_invoice_facts_closing_date check (
    closing_date is null or (
      closing_date < due_month + interval '1 month'
      and closing_date >= (due_month - interval '2 months')::date
      and (due_date is null or (closing_date < due_date and closing_date >= due_date - 25))
    ));

-- 1.1: histórico de regras do ciclo.
create table if not exists public.personal_wallet_card_cycle_settings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.personal_wallet_cards(id) on delete cascade,
  effective_month date not null,
  closing_mode text not null default 'FIXED_DAY' check (closing_mode in ('FIXED_DAY', 'DAYS_BEFORE_DUE')),
  closing_day smallint check (closing_day is null or closing_day between 1 and 31),
  closing_days_before_due smallint check (closing_days_before_due is null or closing_days_before_due between 1 and 20),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  due_business_days boolean not null default false,
  created_at timestamptz not null default now(),
  constraint wallet_cycle_settings_month_first check (extract(day from effective_month) = 1),
  constraint wallet_cycle_settings_unique unique (card_id, effective_month)
);
alter table public.personal_wallet_card_cycle_settings enable row level security;
revoke all on table public.personal_wallet_card_cycle_settings from public, anon, authenticated;
grant select on table public.personal_wallet_card_cycle_settings to authenticated;
drop policy if exists wallet_cycle_settings_owner_select on public.personal_wallet_card_cycle_settings;
create policy wallet_cycle_settings_owner_select on public.personal_wallet_card_cycle_settings
  for select to authenticated using (owner_user_id = auth.uid());

-- Configuração inicial: a regra atual de cada cartão vale para todo o histórico.
insert into public.personal_wallet_card_cycle_settings(
  owner_user_id, card_id, effective_month, closing_mode, closing_day,
  closing_days_before_due, due_day, due_business_days)
select c.owner_user_id, c.id, date '2000-01-01', c.closing_mode, c.closing_day,
  c.closing_days_before_due, c.due_day, c.due_business_days
from public.personal_wallet_cards c
on conflict (card_id, effective_month) do nothing;

-- Toda mudança de regra no cartão passa a valer do mês atual em diante.
create or replace function private.wallet_card_record_cycle_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.personal_wallet_card_cycle_settings(
    owner_user_id, card_id, effective_month, closing_mode, closing_day,
    closing_days_before_due, due_day, due_business_days)
  values (new.owner_user_id, new.id,
    case when tg_op = 'INSERT' then date '2000-01-01'
      -- A partir da fatura aberta pela regra anterior: faturas já fechadas não mudam.
      else private.wallet_card_cycle_month_for_date(old, (now() at time zone 'America/Manaus')::date) end,
    new.closing_mode, new.closing_day, new.closing_days_before_due, new.due_day, new.due_business_days)
  on conflict (card_id, effective_month) do update set
    closing_mode = excluded.closing_mode,
    closing_day = excluded.closing_day,
    closing_days_before_due = excluded.closing_days_before_due,
    due_day = excluded.due_day,
    due_business_days = excluded.due_business_days;
  return new;
end;
$$;
drop trigger if exists trg_wallet_card_cycle_settings on public.personal_wallet_cards;
drop trigger if exists trg_wallet_card_cycle_settings_insert on public.personal_wallet_cards;
drop trigger if exists trg_wallet_card_cycle_settings_update on public.personal_wallet_cards;
create trigger trg_wallet_card_cycle_settings_insert
  after insert on public.personal_wallet_cards
  for each row execute function private.wallet_card_record_cycle_settings();
-- Só registra quando a regra muda de fato (salvar o cartão sem mudar os dias não cria histórico).
create trigger trg_wallet_card_cycle_settings_update
  after update of closing_mode, closing_day, closing_days_before_due, due_day, due_business_days
  on public.personal_wallet_cards
  for each row
  when (old.closing_mode is distinct from new.closing_mode
    or old.closing_day is distinct from new.closing_day
    or old.closing_days_before_due is distinct from new.closing_days_before_due
    or old.due_day is distinct from new.due_day
    or old.due_business_days is distinct from new.due_business_days)
  execute function private.wallet_card_record_cycle_settings();

-- 1.3: feriados nacionais (fixos e móveis pela Páscoa) e próximo dia útil.
create or replace function private.br_easter(p_year integer)
returns date
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
begin
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_year, mo, dy);
end;
$$;

create or replace function private.br_is_business_day(p_date date)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare v_easter date := private.br_easter(extract(year from p_date)::int);
begin
  if extract(isodow from p_date) in (6, 7) then return false; end if;
  if to_char(p_date, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25') then
    return false;
  end if;
  if p_date in (v_easter - 48, v_easter - 47, v_easter - 2, v_easter + 60) then return false; end if;
  return true;
end;
$$;

create or replace function private.br_next_business_day(p_date date)
returns date
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare v_date date := p_date;
begin
  while not private.br_is_business_day(v_date) loop v_date := v_date + 1; end loop;
  return v_date;
end;
$$;

-- 1.0: resolvedor único das datas de um ciclo (mês de vencimento).
create or replace function private.wallet_card_cycle_dates(
  p_card public.personal_wallet_cards,
  p_due_month date,
  out closing_date date,
  out due_date date
)
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_due_month)::date;
  v_mode text := coalesce(p_card.closing_mode, 'FIXED_DAY');
  v_closing_day integer := p_card.closing_day;
  v_days_before integer := p_card.closing_days_before_due;
  v_due_day integer := p_card.due_day;
  v_business boolean := coalesce(p_card.due_business_days, false);
  v_fact_due date;
  v_fact_closing date;
  v_nominal_due date;
  v_close_month date;
begin
  if p_card.id is not null then
    select s.closing_mode, s.closing_day, s.closing_days_before_due, s.due_day, s.due_business_days
      into v_mode, v_closing_day, v_days_before, v_due_day, v_business
    from public.personal_wallet_card_cycle_settings s
    where s.card_id = p_card.id and s.effective_month <= v_month
    order by s.effective_month desc limit 1;
    if not found then
      v_mode := coalesce(p_card.closing_mode, 'FIXED_DAY'); v_closing_day := p_card.closing_day;
      v_days_before := p_card.closing_days_before_due; v_due_day := p_card.due_day;
      v_business := coalesce(p_card.due_business_days, false);
    end if;
    select f.due_date, f.closing_date into v_fact_due, v_fact_closing
    from public.personal_wallet_card_invoice_facts f
    where f.card_id = p_card.id and f.owner_user_id = p_card.owner_user_id and f.due_month = v_month;
  end if;

  if v_due_day is null then
    due_date := coalesce(v_fact_due, v_month);
    closing_date := coalesce(v_fact_closing, (v_month + interval '1 month')::date);
    return;
  end if;

  v_nominal_due := v_month + (least(v_due_day,
    extract(day from (v_month + interval '1 month - 1 day'))::integer) - 1);
  due_date := coalesce(v_fact_due,
    case when v_business then private.br_next_business_day(v_nominal_due) else v_nominal_due end);

  if v_fact_closing is not null then
    closing_date := v_fact_closing;
  elsif v_mode = 'DAYS_BEFORE_DUE' and v_days_before is not null then
    closing_date := due_date - v_days_before;
  elsif v_closing_day is null then
    closing_date := (v_month + interval '1 month')::date;
  else
    -- Fechamento >= vencimento pertence ao mês ANTERIOR (ex.: fecha 28, vence 05).
    v_close_month := case when v_closing_day >= v_due_day
      then (v_month - interval '1 month')::date else v_month end;
    closing_date := v_close_month + (least(v_closing_day,
      extract(day from (v_close_month + interval '1 month - 1 day'))::integer) - 1);
  end if;
end;
$$;

-- Mês de vencimento do ciclo que contém uma data. Fechamento exclusivo.
create or replace function private.wallet_card_cycle_month_for_date(
  p_card public.personal_wallet_cards,
  p_date date
) returns date
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate date;
  v_offset integer;
begin
  -- Dia fixo sem fechamento ou vencimento cadastrado: ciclo = mês civil (regra anterior).
  if coalesce(p_card.closing_mode, 'FIXED_DAY') = 'FIXED_DAY'
     and (p_card.closing_day is null or p_card.due_day is null) then
    return date_trunc('month', p_date)::date;
  end if;
  for v_offset in 0..6 loop
    v_candidate := (date_trunc('month', p_date) + make_interval(months => v_offset))::date;
    if p_date < (private.wallet_card_cycle_dates(p_card, v_candidate)).closing_date then
      return v_candidate;
    end if;
  end loop;
  raise exception 'Nao foi possivel determinar o ciclo da fatura';
end;
$$;

-- Compatibilidade: mesma assinatura de 24/11, agora pelo resolvedor.
create or replace function private.wallet_card_cycle_due_for_date(
  p_card public.personal_wallet_cards,
  p_date date
) returns date
language sql stable
set search_path = public, pg_temp
as $$
  select private.wallet_card_due_in_month(p_card, private.wallet_card_cycle_month_for_date(p_card, p_date));
$$;

-- Roteamento da compra (regra de 24/11), agora pelo resolvedor e por mês.
create or replace function private.wallet_card_first_due_date(
  p_card_id uuid,
  p_expense_date date,
  p_explicit_due_date date default null
) returns date
language plpgsql stable security definer
set search_path to public, pg_temp
as $$
declare
  v_card public.personal_wallet_cards%rowtype;
  v_today date := (now() at time zone 'America/Manaus')::date;
  v_min_month date;
  v_purchase_month date;
  v_open_month date;
  v_result_month date;
begin
  if p_card_id is null then
    return coalesce(p_explicit_due_date, p_expense_date);
  end if;
  if p_expense_date is null then
    raise exception 'Data da compra obrigatória';
  end if;

  select * into v_card
  from public.personal_wallet_cards
  where id = p_card_id and owner_user_id = auth.uid();
  if not found then raise exception 'Cartão não encontrado para o usuário'; end if;

  v_min_month := case
    when v_card.opening_invoice_month is null then null
    when v_card.opening_invoice_state = 'CLOSED'
      then (date_trunc('month', v_card.opening_invoice_month) + interval '1 month')::date
    else date_trunc('month', v_card.opening_invoice_month)::date end;

  v_purchase_month := private.wallet_card_cycle_month_for_date(v_card, p_expense_date);
  v_open_month := private.wallet_card_cycle_month_for_date(v_card, v_today);

  v_result_month := v_purchase_month;
  -- Fatura da compra já fechada: só a recebe se ainda não venceu nem foi paga.
  if v_purchase_month < v_open_month and (
    (private.wallet_card_cycle_dates(v_card, v_purchase_month)).due_date < v_today
    or exists (select 1 from public.personal_wallet_invoice_payments p
      where p.card_id = p_card_id and p.owner_user_id = v_card.owner_user_id
        and date_trunc('month', p.due_month) = v_purchase_month)
    or exists (select 1 from public.personal_wallet_expense_installments i
      join public.personal_wallet_expenses e on e.id = i.expense_id
      where e.card_id = p_card_id and e.owner_user_id = v_card.owner_user_id
        and e.status <> 'CANCELED' and i.status <> 'CANCELED'
        and date_trunc('month', coalesce(e.invoice_due_month, i.due_month)) = v_purchase_month
        and (i.status = 'PAID' or coalesce(i.paid_amount, 0) > 0))
  ) then
    v_result_month := v_open_month;
  end if;

  if v_min_month is not null and v_result_month < v_min_month then
    v_result_month := v_min_month;
  end if;

  if p_explicit_due_date is not null then
    if v_min_month is not null and date_trunc('month', p_explicit_due_date)::date < v_min_month then
      return private.wallet_card_due_in_month(v_card, v_min_month);
    end if;
    if p_expense_date < v_today and date_trunc('month', p_explicit_due_date)::date < v_result_month then
      return v_result_month;
    end if;
    return p_explicit_due_date;
  end if;

  return private.wallet_card_due_in_month(v_card, v_result_month);
end;
$$;

-- Regras do ciclo do cartão (vale do mês atual em diante pelo gatilho).
create or replace function public.personal_wallet_set_card_cycle_rules(
  p_card_id uuid,
  p_closing_mode text,
  p_closing_day integer,
  p_closing_days_before_due integer,
  p_due_day integer,
  p_due_business_days boolean
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_mode text := upper(coalesce(p_closing_mode, 'FIXED_DAY'));
begin
  if auth.uid() is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if v_mode not in ('FIXED_DAY', 'DAYS_BEFORE_DUE') then raise exception 'Modo de fechamento invalido.'; end if;
  if p_due_day is null or p_due_day not between 1 and 31 then raise exception 'Informe o dia de vencimento.'; end if;
  if v_mode = 'FIXED_DAY' and (p_closing_day is null or p_closing_day not between 1 and 31) then
    raise exception 'Informe o dia de fechamento.';
  end if;
  if v_mode = 'DAYS_BEFORE_DUE' and (p_closing_days_before_due is null or p_closing_days_before_due not between 1 and 20) then
    raise exception 'Informe de 1 a 20 dias antes do vencimento.';
  end if;
  update public.personal_wallet_cards set
    closing_mode = v_mode,
    closing_day = case when v_mode = 'FIXED_DAY' then p_closing_day else closing_day end,
    closing_days_before_due = case when v_mode = 'DAYS_BEFORE_DUE' then p_closing_days_before_due else null end,
    due_day = p_due_day,
    due_business_days = coalesce(p_due_business_days, false),
    updated_at = now()
  where id = p_card_id and owner_user_id = auth.uid();
  if not found then raise exception 'Cartao nao encontrado.'; end if;
end;
$$;

-- 1.4: fechamento real de um mês (null apaga e volta à regra do cartão).
create or replace function public.personal_wallet_set_invoice_closing_date(
  p_card_id uuid,
  p_due_month date,
  p_closing_date date
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', p_due_month)::date;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_due_month is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  perform 1 from public.personal_wallet_cards where id = p_card_id and owner_user_id = v_user;
  if not found then raise exception 'Cartao nao encontrado.'; end if;
  if p_closing_date is not null and (p_closing_date >= v_month + interval '1 month'
     or p_closing_date < (v_month - interval '2 months')::date
     or exists(select 1 from public.personal_wallet_card_invoice_facts f
       where f.owner_user_id = v_user and f.card_id = p_card_id and f.due_month = v_month
         and f.due_date is not null and (p_closing_date >= f.due_date or p_closing_date < f.due_date - 25))) then
    raise exception 'O fechamento precisa ser anterior ao vencimento desta fatura (ate 25 dias antes).';
  end if;
  if p_closing_date is null then
    update public.personal_wallet_card_invoice_facts set closing_date = null, updated_at = now()
    where owner_user_id = v_user and card_id = p_card_id and due_month = v_month;
    return;
  end if;
  insert into public.personal_wallet_card_invoice_facts(owner_user_id, card_id, due_month, closing_date, source_type)
  values (v_user, p_card_id, v_month, p_closing_date, 'MANUAL')
  on conflict (owner_user_id, card_id, due_month) do update
    set closing_date = excluded.closing_date, updated_at = now();
end;
$$;

revoke all on function private.wallet_card_record_cycle_settings() from public, anon, authenticated;
revoke all on function private.br_easter(integer) from public, anon, authenticated;
revoke all on function private.br_is_business_day(date) from public, anon, authenticated;
revoke all on function private.br_next_business_day(date) from public, anon, authenticated;
revoke all on function private.wallet_card_cycle_dates(public.personal_wallet_cards, date) from public, anon, authenticated;
revoke all on function private.wallet_card_cycle_month_for_date(public.personal_wallet_cards, date) from public, anon, authenticated;
revoke all on function private.wallet_card_cycle_due_for_date(public.personal_wallet_cards, date) from public, anon, authenticated;
revoke all on function private.wallet_card_first_due_date(uuid, date, date) from public, anon, authenticated;
revoke all on function public.personal_wallet_set_card_cycle_rules(uuid, text, integer, integer, integer, boolean) from public, anon;
grant execute on function public.personal_wallet_set_card_cycle_rules(uuid, text, integer, integer, integer, boolean) to authenticated;
revoke all on function public.personal_wallet_set_invoice_closing_date(uuid, date, date) from public, anon;
grant execute on function public.personal_wallet_set_invoice_closing_date(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
commit;
