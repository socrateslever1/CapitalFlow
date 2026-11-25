-- Edição de lançamento de cartão sem destruir parcelas.
--
-- Antes: personal_wallet_update_expense_idempotent sempre apagava e recriava as
-- parcelas, numerando a partir de 1 e redividindo o valor. Em parcelado
-- importado (ex.: parcelas 11 a 18 de 18), trocar só a categoria renumerava
-- tudo e podia redistribuir centavos.
--
-- Agora:
--   1. Se valor, data da compra e mês da fatura não mudam, só descrição,
--      categoria e observação são atualizadas; as parcelas ficam intactas.
--   2. Se mudam, as parcelas são recriadas como antes, mas a numeração começa
--      na menor parcela existente (11/18 continua 11/18).
-- Mesma assinatura, permissões e validações; idempotência por request_id e
-- trava de limite preservadas. Nenhum dado existente é alterado pela migration.

create or replace function public.personal_wallet_update_expense_idempotent(
  p_expense_id uuid,p_description text,p_amount numeric,p_category text,
  p_expense_date date,p_due_date date,p_notes text,p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_expense public.personal_wallet_expenses%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_due date:=coalesce(p_due_date,p_expense_date);
  v_payload jsonb;
  v_base numeric(14,2);
  v_piece numeric(14,2);
  v_index integer;
  v_first_number integer;
  v_metadata_only boolean;
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

  -- Só texto mudou: valor, data da compra e mês da fatura iguais aos atuais.
  v_metadata_only := round(p_amount,2)=round(v_expense.amount,2)
    and p_expense_date=v_expense.expense_date
    and date_trunc('month',v_due)=date_trunc('month',coalesce(v_expense.due_date,v_expense.expense_date));

  update public.personal_wallet_expenses
  set description=trim(p_description),amount=round(p_amount,2),
      category=coalesce(nullif(trim(p_category),''),'Outros'),expense_date=p_expense_date,
      due_date=case when v_metadata_only then v_expense.due_date else p_due_date end,
      notes=nullif(trim(coalesce(p_notes,'')),''),
      mutation_requests=mutation_requests||jsonb_build_object(p_request_id::text,v_payload),updated_at=now()
  where id=p_expense_id;

  if v_metadata_only then
    return private.wallet_recalculate_card_position(v_user,v_expense.card_id)||jsonb_build_object('replayed',false,'installments_preserved',true);
  end if;

  select coalesce(min(installment_number),1) into v_first_number
  from public.personal_wallet_expense_installments
  where expense_id=p_expense_id and status<>'CANCELED';
  delete from public.personal_wallet_expense_installments where expense_id=p_expense_id;
  v_base:=trunc((round(p_amount,2)*100)/v_expense.installment_count)/100;
  for v_index in 1..v_expense.installment_count loop
    v_piece:=case when v_index=v_expense.installment_count
      then round(p_amount,2)-v_base*(v_expense.installment_count-1) else v_base end;
    insert into public.personal_wallet_expense_installments(
      expense_id,owner_user_id,installment_number,due_month,amount,paid_amount,status
    ) values (p_expense_id,v_user,v_first_number+v_index-1,
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
  return v_position||jsonb_build_object('replayed',false,'installments_preserved',false);
end;
$$;

revoke all on function public.personal_wallet_update_expense_idempotent(uuid,text,numeric,text,date,date,text,uuid) from public,anon;
grant execute on function public.personal_wallet_update_expense_idempotent(uuid,text,numeric,text,date,date,text,uuid) to authenticated;
