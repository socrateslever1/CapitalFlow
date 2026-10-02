do $$
begin
  if to_regclass('public.payment_transactions') is null
     or to_regclass('public.perfis') is null then
    return;
  end if;

  alter table public.payment_transactions
    drop constraint if exists payment_transactions_operator_profile_id_fkey;

  alter table public.payment_transactions
    add constraint payment_transactions_operator_profile_id_fkey
    foreign key (operator_profile_id)
    references public.perfis(id)
    on delete set null
    not valid;
end;
$$;
