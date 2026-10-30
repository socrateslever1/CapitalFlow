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
notify pgrst,'reload schema';
commit;
