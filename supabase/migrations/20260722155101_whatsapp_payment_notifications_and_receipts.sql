set search_path = public;

create or replace function public.handle_parcela_paid_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_contract record;
  v_config record;
  v_message text;
  v_client_phone text;
  v_receipt_link text;
  v_paid_delta numeric;
  v_amount_label text;
begin
  v_paid_delta := greatest(0, coalesce(new.paid_total, 0) - coalesce(old.paid_total, 0));
  if v_paid_delta <= 0.005 then return new; end if;

  select id, debtor_name, debtor_phone, profile_id, owner_id, portal_token, portal_shortcode
    into v_contract
  from public.contratos
  where id = new.loan_id;

  if not found then return new; end if;
  v_client_phone := regexp_replace(coalesce(v_contract.debtor_phone, ''), '\D', '', 'g');
  v_amount_label := 'R$ ' || replace(to_char(v_paid_delta, 'FM999999990D00'), '.', ',');
  if v_contract.portal_token is not null and coalesce(v_contract.portal_shortcode, '') <> '' then
    v_receipt_link := 'https://capflow.pages.dev/?portal=' || v_contract.portal_token::text
      || '&portal_code=' || v_contract.portal_shortcode
      || '&receipt=1&installment_id=' || new.id::text;
  end if;

  select * into v_config from public.whatsapp_configs
  where profile_id = coalesce(v_contract.profile_id, v_contract.owner_id);

  v_message := coalesce(
    nullif(trim(v_config.template_payment_received), ''),
    'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela}. Obrigado.'
  );
  v_message := replace(v_message, '{nome_cliente}', coalesce(v_contract.debtor_name, 'Cliente'));
  v_message := replace(v_message, '{valor_parcela}', v_amount_label);
  v_message := replace(v_message, '{data_vencimento}', to_char(coalesce(new.data_vencimento, new.due_date), 'DD/MM/YYYY'));
  v_message := replace(v_message, '{copia_e_cola_pix}', '');
  v_message := replace(v_message, '{link_portal}', coalesce(v_receipt_link, ''));
  if v_receipt_link is not null and position(v_receipt_link in v_message) = 0 then
    v_message := trim(v_message) || ' Comprovante: ' || v_receipt_link;
  end if;

  if length(v_client_phone) >= 10 then
    insert into public.whatsapp_queue(profile_id, phone, message, status, loan_id, parcela_id)
    values (coalesce(v_contract.profile_id, v_contract.owner_id), v_client_phone, v_message, 'PENDING', v_contract.id, new.id);
  end if;

  return new;
end;
$$;

revoke all on function public.handle_parcela_paid_whatsapp() from public, anon, authenticated;
grant execute on function public.handle_parcela_paid_whatsapp() to service_role;
