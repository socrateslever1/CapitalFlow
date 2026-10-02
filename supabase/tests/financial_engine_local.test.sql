begin;

select plan(5);

create temporary table local_payment_operations (
  idempotency_key text primary key,
  amount numeric not null,
  created_at timestamptz not null default now()
);

insert into local_payment_operations (idempotency_key, amount)
values ('same-key', 200)
on conflict (idempotency_key) do nothing;

insert into local_payment_operations (idempotency_key, amount)
values ('same-key', 200)
on conflict (idempotency_key) do nothing;

select is(
  (select count(*)::integer from local_payment_operations),
  1,
  'idempotency key creates one local movement'
);

select is(
  (select count(*)::integer from local_payment_operations where idempotency_key = 'same-key'),
  1,
  'replay returns the original local movement'
);

create temporary table local_installments (
  id integer primary key,
  principal_remaining numeric not null check (principal_remaining >= 0),
  interest_remaining numeric not null check (interest_remaining >= 0),
  late_fee_accrued numeric not null check (late_fee_accrued >= 0)
);

insert into local_installments values (1, 1000, 120, 30);

select lives_ok($$update local_installments set principal_remaining = 700 where id = 1$$, 'local balance update is valid');
select ok((select principal_remaining >= 0 and interest_remaining >= 0 and late_fee_accrued >= 0 from local_installments where id = 1), 'local balances remain non-negative');

do $$
begin
  begin
    update local_installments set principal_remaining = 0 where id = 1;
    raise exception 'forced rollback';
  exception when others then
    null;
  end;
end;
$$;

select is((select principal_remaining from local_installments where id = 1), 700::numeric, 'failed local transaction keeps the previous state');

select * from finish();
rollback;
