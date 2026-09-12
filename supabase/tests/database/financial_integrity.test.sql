begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'contratos'),
  'RLS habilitado em contratos'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'parcelas'),
  'RLS habilitado em parcelas'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'transacoes'),
  'RLS habilitado em transacoes'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'fontes'),
  'RLS habilitado em fontes'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'parcelas'
      and t.tgname = 'trg_guard_installment_financial_integrity'
      and not t.tgisinternal
  ),
  'trigger de integridade financeira de parcelas existe'
);

select ok(
  has_function_privilege('authenticated', 'public.financial_integrity_report(uuid)', 'EXECUTE'),
  'authenticated pode executar relatorio de integridade'
);

select ok(
  not has_function_privilege('anon', 'public.financial_integrity_report(uuid)', 'EXECUTE'),
  'anon nao pode executar relatorio de integridade'
);

select ok(
  has_function_privilege('authenticated', 'public.reverse_payment_group(uuid,text,text,uuid)', 'EXECUTE'),
  'authenticated pode executar estorno agrupado'
);

select ok(
  not has_function_privilege('anon', 'public.reverse_payment_group(uuid,text,text,uuid)', 'EXECUTE'),
  'anon nao pode executar estorno agrupado'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and not c.relrowsecurity
  ),
  'todas as tabelas public possuem RLS habilitado'
);

select * from finish();
rollback;
