create or replace function private.guard_interest_free_installment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.interest_free_installment, false) then
    if upper(coalesce(new.billing_cycle, '')) <> 'INSTALLMENT_FIXED' then
      raise exception 'Sem juros no parcelamento so pode ser usado em contrato parcelado.';
    end if;

    -- Sem juros programados no parcelamento.
    -- Multa e mora diaria permanecem configuraveis e so incidem apos o vencimento.
    new.interest_rate := 0;
    new.customer_margin_percent := 0;
    new.customer_total_payable := round(coalesce(new.principal, 0)::numeric, 2);

    if coalesce(new.funding_installments_count, 0) > 0 then
      new.customer_installment_value := round(
        coalesce(new.principal, 0)::numeric / new.funding_installments_count,
        2
      );
    end if;

    new.policies_snapshot :=
      coalesce(new.policies_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'interestFreeInstallment', true,
        'interestRate', 0,
        'finePercent', coalesce(new.fine_percent, 0),
        'dailyInterestPercent', coalesce(new.daily_interest_percent, 0)
      );
  else
    new.policies_snapshot :=
      coalesce(new.policies_snapshot, '{}'::jsonb)
      || jsonb_build_object('interestFreeInstallment', false);
  end if;

  return new;
end;
$$;

revoke all on function private.guard_interest_free_installment() from public, anon, authenticated;
