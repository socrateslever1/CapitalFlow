alter table public.clientes
  add column if not exists collection_days_mode text not null default 'ALL_DAYS';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clientes'::regclass
      and conname = 'clientes_collection_days_mode_check'
  ) then
    alter table public.clientes
      add constraint clientes_collection_days_mode_check
      check (collection_days_mode in ('ALL_DAYS', 'SKIP_SUNDAY', 'SKIP_WEEKEND'));
  end if;
end
$$;
