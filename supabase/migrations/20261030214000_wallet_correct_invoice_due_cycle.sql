-- Fatura: competência (fechamento) distinta do mês real de vencimento.
-- Corrigir o vencimento NÃO pode criar uma segunda consolidação.
-- A função utiliza locks, idempotência e recusa ciclos pagos ou conflitos.
begin;
create or replace function public.personal_wallet_correct_invoice_override(
  p_card_id uuid,
  p_previous_due_month date,
  p_new_due_month date,
  p_due_date date,
  p_amount numeric,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $wallet$
declare
  v_owner uuid := auth.uid();
  v_previous public.personal_wallet_expenses%rowtype;
  v_target public.personal_wallet_expenses%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_payload jsonb;
  v_replay public.personal_wallet_expenses%rowtype;
  v_result jsonb;
  v_first date;
  v_second date;
begin
  if v_owner is null or not public.is_platform_super_admin()
     or not exists(select 1 from public.user_modulos
       where user_id=v_owner and modulo_chave='carteira' and ativo)
  then raise exception 'Sem autorização para corrigir faturas.'; end if;
  if p_card_id is null or p_new_due_month is null or p_due_date is null
     or p_request_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2)
     or p_new_due_month<>date_trunc('month',p_new_due_month)::date
     or p_due_date<date_trunc('month',p_new_due_month)::date
     or p_due_date>=(date_trunc('month',p_new_due_month)::date+interval '1 month')::date
     or (p_previous_due_month is not null
       and p_previous_due_month<>date_trunc('month',p_previous_due_month)::date)
  then raise exception 'Informe valor, mês de pagamento e data exata de vencimento válidos.'; end if;

  v_payload:=jsonb_build_object('operation','CORRECT_INVOICE_DUE_CYCLE',
    'card_id',p_card_id,'previous_due_month',p_previous_due_month,
    'new_due_month',p_new_due_month,'due_date',p_due_date,'amount',round(p_amount,2));
  v_first:=least(coalesce(p_previous_due_month,p_new_due_month),p_new_due_month);
  v_second:=greatest(coalesce(p_previous_due_month,p_new_due_month),p_new_due_month);
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text||':invoice-override:'||p_card_id::text||':'||v_first::text,0));
  if v_second<>v_first then
    perform pg_advisory_xact_lock(hashtextextended(
      v_owner::text||':invoice-override:'||p_card_id::text||':'||v_second::text,0));
  end if;
  select * into v_card from public.personal_wallet_cards
    where id=p_card_id and owner_user_id=v_owner and status='ACTIVE' for update;
  if not found then raise exception 'Cartão indisponível ou não autorizado.'; end if;

  select * into v_replay from public.personal_wallet_expenses
    where owner_user_id=v_owner
      and mutation_requests ? p_request_id::text limit 1 for update;
  if found then
    if v_replay.mutation_requests->p_request_id::text <> v_payload then
      raise exception 'Identificador reutilizado com outro ajuste.';
    end if;
    return private.wallet_recalculate_card_position(v_owner,p_card_id)
      ||jsonb_build_object('replayed',true,'expense_id',v_replay.id);
  end if;

  if exists(select 1 from public.personal_wallet_invoice_payments
    where owner_user_id=v_owner and card_id=p_card_id and
      due_month in (coalesce(p_previous_due_month,p_new_due_month),p_new_due_month))
  then raise exception 'Há pagamento registrado neste ciclo. Corrija pelo fluxo auditado de pagamentos.'; end if;

  if p_previous_due_month is null or p_previous_due_month=p_new_due_month then
    -- Reutiliza a criação/edição CANÔNICA: nunca insere segunda consolidação do mesmo mês.
    v_result:=public.personal_wallet_set_monthly_invoice_override(
      p_card_id,p_new_due_month,p_amount,p_request_id);
  else
    select * into v_previous from public.personal_wallet_expenses
    where owner_user_id=v_owner and card_id=p_card_id
      and entry_type='INVOICE_OVERRIDE' and status='PENDING'
      and invoice_due_month=p_previous_due_month for update;
    if not found then
      raise exception 'Consolidação original não encontrada. Atualize a lista antes de corrigir o mês.';
    end if;
    if exists(select 1 from public.personal_wallet_expense_installments
      where expense_id=v_previous.id and (status='PAID' or coalesce(paid_amount,0)>0))
    then raise exception 'A fatura original já possui pagamento.'; end if;
    if exists(select 1 from public.personal_wallet_expenses e
      join public.personal_wallet_expense_installments i on i.expense_id=e.id
      where e.owner_user_id=v_owner and e.card_id=p_card_id and e.status<>'CANCELED'
        and e.entry_type='PURCHASE' and i.status<>'CANCELED'
        and i.due_month=p_new_due_month)
    then raise exception 'Existem compras no mês de destino. Corrija primeiro os ciclos individualmente.'; end if;
    select * into v_target from public.personal_wallet_expenses
      where owner_user_id=v_owner and card_id=p_card_id
        and entry_type='INVOICE_OVERRIDE' and status='PENDING'
        and invoice_due_month=p_new_due_month for update;
    if found then
      if v_target.id=v_previous.id
         or v_target.is_opening_summary
         or v_target.amount<>v_previous.amount
         or exists(select 1 from public.personal_wallet_expense_installments
           where expense_id=v_target.id and (status='PAID' or coalesce(paid_amount,0)>0))
      then raise exception 'Já existe outra fatura no mês de destino. Não foi possível reunir valores diferentes ou pagamentos.'; end if;
      -- Valor idêntico, nenhum pagamento: o destino é uma tentativa duplicada.
      -- Cancelamento LÓGICO: histórico e documentos permanecem.
      update public.personal_wallet_expenses
        set status='CANCELED',updated_at=now(),
          mutation_requests=mutation_requests||jsonb_build_object(
            p_request_id::text,v_payload||jsonb_build_object('duplicated_target',true))
        where id=v_target.id;
      update public.personal_wallet_expense_installments set status='CANCELED'
        where expense_id=v_target.id and status<>'PAID';
    end if;
    update public.personal_wallet_expenses
      set invoice_due_month=p_new_due_month,due_date=p_due_date,
        description='Fatura consolidada '||to_char(p_new_due_month,'MM/YYYY'),
        amount=round(p_amount,2),
        mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),
        updated_at=now()
      where id=v_previous.id and owner_user_id=v_owner;
    update public.personal_wallet_expense_installments
      set due_month=p_new_due_month,amount=round(p_amount,2)
      where expense_id=v_previous.id and status='PENDING';
    if v_previous.is_opening_summary and v_card.opening_invoice_month=p_previous_due_month then
      update public.personal_wallet_cards set opening_invoice_month=p_new_due_month,
        updated_at=now() where id=p_card_id and owner_user_id=v_owner;
    end if;
    v_result:=private.wallet_recalculate_card_position(v_owner,p_card_id)
      ||jsonb_build_object('expense_id',v_previous.id,'replayed',false,
        'merged_duplicate',v_target.id is not null);
  end if;
  -- Data real da emissora é persistida no mesmo COMMIT da correção.
  -- Snapshot da fatura não altera pagamentos, conta bancária ou ledger.
  insert into public.personal_wallet_card_invoice_facts
    (owner_user_id,card_id,due_month,due_date,invoice_total,source_type,observed_at,updated_at)
  values (v_owner,p_card_id,p_new_due_month,p_due_date,round(p_amount,2),'MANUAL',now(),now())
  on conflict(owner_user_id,card_id,due_month)
  do update set due_date=excluded.due_date,invoice_total=excluded.invoice_total,
    minimum_payment=case when personal_wallet_card_invoice_facts.minimum_payment>excluded.invoice_total
      then null else personal_wallet_card_invoice_facts.minimum_payment end,
    source_type='MANUAL',updated_at=now();
  return v_result||jsonb_build_object('due_date',p_due_date);
end;
$wallet$;
revoke all on function public.personal_wallet_correct_invoice_override(uuid,date,date,date,numeric,uuid)
  from public,anon;
grant execute on function public.personal_wallet_correct_invoice_override(uuid,date,date,date,numeric,uuid)
  to authenticated;
notify pgrst,'reload schema';
commit;
