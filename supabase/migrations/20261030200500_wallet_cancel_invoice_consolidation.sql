-- Cancelamento lógico e auditável de valor consolidado de uma fatura NÃO PAGA.
-- Não exclui compras, parcelas, histórico de pagamentos ou documentos importados.
-- Isola a correção dos ciclos; não cria estornos nem movimenta saldo bancário.
begin;
create or replace function public.personal_wallet_cancel_invoice_consolidation(
  p_card_id uuid, p_due_month date, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_month date;
  v_expense public.personal_wallet_expenses%rowtype;
  v_payload jsonb;
begin
  if v_owner is null or not public.is_platform_super_admin() or not exists(
    select 1 from public.user_modulos m where m.user_id=v_owner
      and m.modulo_chave='carteira' and m.ativo
  ) then raise exception 'Acesso não autorizado à Carteira.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null
    or p_due_month<>date_trunc('month',p_due_month)::date
  then raise exception 'Informe cartão, mês de vencimento e identificador válidos.'; end if;
  v_month:=p_due_month;
  v_payload:=jsonb_build_object('operation','CANCEL_INVOICE_CONSOLIDATION',
    'card_id',p_card_id,'due_month',v_month);
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text||':invoice-override:'||p_card_id::text||':'||v_month::text,0
  ));
  perform 1 from public.personal_wallet_cards
    where id=p_card_id and owner_user_id=v_owner and status='ACTIVE' for update;
  if not found then raise exception 'Cartão ativo não encontrado.'; end if;
  select * into v_expense from public.personal_wallet_expenses
    where owner_user_id=v_owner and card_id=p_card_id
      and entry_type='INVOICE_OVERRIDE' and invoice_due_month=v_month
    order by (status<>'CANCELED') desc, updated_at desc limit 1 for update;
  if not found then raise exception 'Este ciclo não possui valor consolidado para cancelar.'; end if;
  if v_expense.mutation_requests ? p_request_id::text then
    if v_expense.mutation_requests->p_request_id::text<>v_payload then
      raise exception 'Identificador reutilizado com parâmetros diferentes.';
    end if;
    return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month)
      ||jsonb_build_object('replayed',true);
  end if;
  if v_expense.status='CANCELED' then
    raise exception 'Consolidação já cancelada. Recarregue a fatura.'; end if;
  if exists(
    select 1 from public.personal_wallet_invoice_payments p
    where p.owner_user_id=v_owner and p.card_id=p_card_id and p.due_month=v_month
  ) or exists(
    select 1 from public.personal_wallet_expense_installments i
    where i.expense_id=v_expense.id
      and (i.status='PAID' or coalesce(i.paid_amount,0)>0)
  ) then
    raise exception 'Esta fatura possui pagamento. Corrija os pagamentos pelo fluxo financeiro auditado antes de cancelar a consolidação.';
  end if;
  update public.personal_wallet_expenses set status='CANCELED',
    mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),
    updated_at=now() where id=v_expense.id;
  update public.personal_wallet_expense_installments set status='CANCELED'
    where expense_id=v_expense.id and status<>'PAID';
  -- Compras reconhecidas permanecem no ciclo; sem a consolidação, passam
  -- a compor o saldo individual, sem serem excluídas.
  return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month)
    ||jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.personal_wallet_cancel_invoice_consolidation(uuid,date,uuid)
  from public,anon;
grant execute on function public.personal_wallet_cancel_invoice_consolidation(uuid,date,uuid)
  to authenticated;
-- Preserva edição de valor/data/descrição quando o cartão já veio excedido.
-- A alteração só é recusada se AUMENTAR a dívida além do maior valor entre
-- limite contratado e posição anterior. Pagamentos e parcelas pagas seguem bloqueados.
create or replace function public.personal_wallet_update_expense_idempotent(
  p_expense_id uuid,p_description text,p_amount numeric,p_category text,
  p_expense_date date,p_due_date date,p_notes text,p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $
declare
  v_user uuid:=auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_due date:=coalesce(p_due_date,p_expense_date);
  v_payload jsonb;
  v_base numeric(14,2);
  v_piece numeric(14,2);
  v_index integer;
  v_position jsonb;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_request_id is null or p_expense_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  if coalesce(trim(p_description),'')='' or length(trim(p_description))>240 then raise exception 'Informe uma descricao com ate 240 caracteres.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Informe um valor positivo com ate duas casas decimais.'; end if;
  if p_expense_date is null then raise exception 'Informe a data da despesa.'; end if;
  v_payload:=jsonb_build_object('operation','UPDATE_EXPENSE','expense_id',p_expense_id,
    'description',trim(p_description),'amount',round(p_amount,2),'category',coalesce(nullif(trim(p_category),''),'Outros'),
    'expense_date',p_expense_date,'due_date',p_due_date,'notes',nullif(trim(coalesce(p_notes,'')),''));

  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':expense:'||p_expense_id::text,0));
  select * into v_expense from public.personal_wallet_expenses
  where id=p_expense_id and owner_user_id=v_user for update;
  if not found then raise exception 'Lancamento nao encontrado.'; end if;
  if v_expense.mutation_requests ? p_request_id::text then
    if v_expense.mutation_requests->p_request_id::text<>v_payload then raise exception 'Chave de requisicao reutilizada com dados diferentes.'; end if;
    return private.wallet_recalculate_card_position(v_user,v_expense.card_id)||jsonb_build_object('replayed',true);
  end if;
  if exists(select 1 from public.personal_wallet_expenses e where e.owner_user_id=v_user and e.id<>p_expense_id and e.mutation_requests ? p_request_id::text) then
    raise exception 'Chave de requisicao ja utilizada em outro lancamento.';
  end if;
  if v_expense.card_id is null or v_expense.entry_type<>'PURCHASE' or v_expense.status<>'PENDING' then
    raise exception 'Somente lancamentos pendentes de compra podem ser editados.';
  end if;
  if exists(select 1 from public.personal_wallet_expense_installments where expense_id=p_expense_id and (status='PAID' or paid_amount>0)) then
    raise exception 'Nao e possivel editar um lancamento com parcela paga.';
  end if;
  select * into v_card from public.personal_wallet_cards
  where id=v_expense.card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartao nao encontrado.'; end if;

  update public.personal_wallet_expenses
  set description=trim(p_description),amount=round(p_amount,2),
      category=coalesce(nullif(trim(p_category),''),'Outros'),expense_date=p_expense_date,
      due_date=p_due_date,notes=nullif(trim(coalesce(p_notes,'')),''),
      mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),updated_at=now()
  where id=p_expense_id;
  delete from public.personal_wallet_expense_installments where expense_id=p_expense_id;
  v_base:=trunc((round(p_amount,2)*100)/v_expense.installment_count)/100;
  for v_index in 1..v_expense.installment_count loop
    v_piece:=case when v_index=v_expense.installment_count
      then round(p_amount,2)-v_base*(v_expense.installment_count-1) else v_base end;
    insert into public.personal_wallet_expense_installments(
      expense_id,owner_user_id,installment_number,due_month,amount,paid_amount,status
    ) values (p_expense_id,v_user,v_index,
      (date_trunc('month',v_due)::date+make_interval(months=>v_index-1))::date,v_piece,0,'PENDING');
  end loop;
  v_position:=private.wallet_recalculate_card_position(v_user,v_expense.card_id);
  -- A posição anterior pode já estar acima do limite: edições neutras ou
  -- redutoras são permitidas, mas nunca aumentar o excedente registrado.
  if v_card.credit_limit > 0
     and (v_position->>'committed_limit')::numeric > greatest(v_card.credit_limit,v_card.used_limit)
     and (v_position->>'committed_limit')::numeric > v_card.used_limit then
    raise exception 'A alteração aumenta o limite excedido do cartão.';
  end if;
  return v_position||jsonb_build_object('replayed',false);
end;
$;

-- Excluir a fatura não paga equivale a cancelar seus lançamentos contábeis
-- ainda pendentes. O banco nunca perde trilha de auditoria ou pagamentos.
alter table public.personal_wallet_cards
  add column if not exists invoice_cancel_requests jsonb not null default '{}'::jsonb;

create or replace function public.personal_wallet_cancel_unpaid_invoice_cycle(
  p_card_id uuid, p_due_month date, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $
declare
  v_owner uuid := auth.uid();
  v_card public.personal_wallet_cards%rowtype;
  v_ids uuid[];
  v_month date;
  v_payload jsonb;
begin
  if v_owner is null or not public.is_platform_super_admin()
    or not exists(select 1 from public.user_modulos m where m.user_id=v_owner
      and m.modulo_chave='carteira' and m.ativo)
  then raise exception 'Acesso não autorizado à Carteira.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null
    or date_trunc('month',p_due_month)::date<>p_due_month
  then raise exception 'Identificadores ou mês da fatura inválidos.'; end if;
  v_month:=p_due_month;
  v_payload:=jsonb_build_object('operation','CANCEL_UNPAID_INVOICE',
    'card_id',p_card_id,'due_month',v_month);
  -- Serializa com consolidação e pagamento do cartão; impede corrida de escrita.
  perform pg_advisory_xact_lock(hashtextextended(
    v_owner::text||':invoice-override:'||p_card_id::text||':'||v_month::text,0
  ));
  select * into v_card from public.personal_wallet_cards
    where owner_user_id=v_owner and id=p_card_id and status='ACTIVE' for update;
  if not found then raise exception 'Cartão ativo não encontrado.'; end if;
  if v_card.invoice_cancel_requests ? p_request_id::text then
    if v_card.invoice_cancel_requests->p_request_id::text<>v_payload then
      raise exception 'Identificador reutilizado com parâmetros diferentes.';
    end if;
    return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month)
      ||jsonb_build_object('replayed',true);
  end if;
  -- Não excluir qualquer ciclo com histórico de pagamento bancário/manual.
  if exists(select 1 from public.personal_wallet_invoice_payments
    where owner_user_id=v_owner and card_id=p_card_id and due_month=v_month)
  then raise exception 'Esta fatura já recebeu pagamento. É necessário ajuste auditado do pagamento antes de excluir.'; end if;

  select array_agg(distinct e.id) into v_ids
  from public.personal_wallet_expenses e
  join public.personal_wallet_expense_installments i on i.expense_id=e.id
  where e.owner_user_id=v_owner and e.card_id=p_card_id and e.status<>'CANCELED'
    and i.owner_user_id=v_owner and i.due_month=v_month
    and i.status<>'CANCELED';

  if coalesce(array_length(v_ids,1),0)=0 then
    raise exception 'Não existem lançamentos ativos nesta fatura.'; end if;
  -- Uma compra parcelada pertence a vários meses. Exigir cancelamento da
  -- compra individual evita apagar parcelas de outras faturas inadvertidamente.
  if exists(select 1 from public.personal_wallet_expenses e
    where e.id=any(v_ids) and e.entry_type not in ('PURCHASE','INVOICE_OVERRIDE'))
  then raise exception 'Este ciclo contém movimentos não editáveis. Revise os itens individualmente.'; end if;
  if exists(select 1 from public.personal_wallet_expense_installments i
    where i.expense_id=any(v_ids)
      and (i.status='PAID' or coalesce(i.paid_amount,0)>0))
  then raise exception 'Existem parcelas pagas. Não é permitido excluir a fatura.'; end if;
  if exists(select 1 from public.personal_wallet_expense_installments i
    where i.expense_id=any(v_ids) and i.due_month<>v_month
      and i.status<>'CANCELED')
  then raise exception 'A fatura contém compras parceladas em outros meses. Cancele cada compra individualmente.'; end if;

  update public.personal_wallet_expenses
    set status='CANCELED',updated_at=now() where id=any(v_ids);
  update public.personal_wallet_expense_installments
    set status='CANCELED' where expense_id=any(v_ids) and status<>'PAID';
  update public.personal_wallet_cards set
    invoice_cancel_requests=invoice_cancel_requests||jsonb_build_object(p_request_id::text,v_payload),
    updated_at=now()
    where id=p_card_id and owner_user_id=v_owner;
  return private.wallet_recalculate_card_position(v_owner,p_card_id,v_month)
    ||jsonb_build_object('replayed',false,'canceled_expenses',array_length(v_ids,1));
end;
$;
revoke all on function public.personal_wallet_cancel_unpaid_invoice_cycle(uuid,date,uuid)
  from public,anon;
grant execute on function public.personal_wallet_cancel_unpaid_invoice_cycle(uuid,date,uuid)
  to authenticated;

notify pgrst,'reload schema';
commit;
